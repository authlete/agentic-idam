{{/* Shared helpers: labels, hostname, Cloud SQL proxy sidecar, and the admin/TA env+volume sets. */}}

{{- define "tp.labels" -}}
app.kubernetes.io/part-of: trust-platform
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Fully-qualified hostname for a service, e.g. (include "tp.host" (list . "console")) */}}
{{- define "tp.host" -}}
{{- $root := index . 0 -}}{{- $name := index . 1 -}}
{{- printf "%s.%s" $name $root.Values.domain -}}
{{- end -}}

{{/* Cloud SQL proxy as a native sidecar (initContainer, restartPolicy: Always) so it also
     self-terminates in Jobs. Auth is ADC = the node service account (has roles/cloudsql.client). */}}
{{- define "tp.cloudsqlProxy" -}}
- name: cloudsql-proxy
  image: {{ .Values.images.cloudSqlProxy }}
  args:
    - "--structured-logs"
    - "--port=5432"
    - {{ .Values.database.cloudSql.instance | quote }}
  restartPolicy: Always
  securityContext:
    runAsNonRoot: true
  resources:
    requests: { cpu: 10m, memory: 32Mi }
    limits: { cpu: 250m, memory: 128Mi }
{{- end -}}

{{/* Env shared by the admin Deployment and the two admin-based cron jobs.
     DB_HOST is the proxy on localhost (cloudsql) or the in-cluster postgres Service. */}}
{{- define "tp.adminEnv" -}}
- { name: INSIDE_CONTAINER, value: "true" }
- { name: PRODUCTION, value: "true" }
- { name: DB_HOST, value: {{ eq .Values.database.mode "cloudsql" | ternary "127.0.0.1" "postgres" | quote }} }
- { name: DB_PORT, value: "5432" }
- { name: REDIS_LOCATION, value: "redis://redis:6379/0" }
- { name: ALLOWED_HOSTS, value: "{{ include "tp.host" (list . "admin") }},admin,localhost,127.0.0.1" }
- { name: CORS_ORIGINS, value: "https://{{ include "tp.host" (list . "admin") }}" }
- { name: CSRF_TRUSTED_ORIGINS, value: "https://{{ include "tp.host" (list . "admin") }}" }
- name: DJANGO_SECRET_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.secrets.admin }}, key: DJANGO_SECRET_KEY } }
- name: DB_PASSWORD
  valueFrom: { secretKeyRef: { name: {{ .Values.secrets.admin }}, key: DB_PASSWORD } }
- name: MFA_ENCRYPTION_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.secrets.admin }}, key: MFA_ENCRYPTION_KEY } }
{{- end -}}

{{- define "tp.adminVolumeMounts" -}}
- { name: private, mountPath: /app/private.json, subPath: private.json, readOnly: true }
- { name: publickeys, mountPath: /app/publickeys, readOnly: true }
- { name: historical, mountPath: /app/historical_keys, readOnly: true }
- { name: localsettings, mountPath: /app/inmoradmin/localsettings.py, subPath: localsettings.py, readOnly: true }
{{- end -}}

{{- define "tp.adminVolumes" -}}
- { name: private, secret: { secretName: {{ .Values.secrets.inmorPrivate }} } }
- { name: publickeys, configMap: { name: {{ .Values.configMaps.inmorPublicKeys }} } }
- { name: historical, secret: { secretName: {{ .Values.secrets.inmorHistorical }} } }
- { name: localsettings, configMap: { name: inmor-admin-localsettings } }
{{- end -}}

{{/* TA config + keys + self-signed cert, shared by the TA and the collection-walk cron.
     (The TA also mounts templates; see inmor-ta.yaml.) tls.pem/tls-key.pem come from one secret. */}}
{{- define "tp.taVolumeMounts" -}}
- { name: taconfig, mountPath: /app/taconfig.toml, subPath: taconfig.toml, readOnly: true }
- { name: private, mountPath: /app/private.json, subPath: private.json, readOnly: true }
- { name: publickeys, mountPath: /app/publickeys, readOnly: true }
- { name: historical, mountPath: /app/historical_keys, readOnly: true }
- { name: tls, mountPath: /app/tls.pem, subPath: tls.pem, readOnly: true }
- { name: tls, mountPath: /app/tls-key.pem, subPath: tls-key.pem, readOnly: true }
{{- end -}}

{{- define "tp.taVolumes" -}}
- { name: taconfig, configMap: { name: inmor-taconfig } }
- { name: private, secret: { secretName: {{ .Values.secrets.inmorPrivate }} } }
- { name: publickeys, configMap: { name: {{ .Values.configMaps.inmorPublicKeys }} } }
- { name: historical, secret: { secretName: {{ .Values.secrets.inmorHistorical }} } }
- { name: tls, secret: { secretName: {{ .Values.secrets.inmorTaTls }} } }
{{- end -}}
