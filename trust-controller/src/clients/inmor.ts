// Inmor Admin API facade. The trust-controller is the SOLE caller of Inmor's Admin API
// (:8000/api/v1, X-API-Key). Inmor stays hidden behind this facade — the rest of the demo
// never talks to it directly.
//
//   write/control side  ->  this facade  (trustmarktypes, trustmarks, subordinates, auditlog)
//   read/serve side     ->  Authlete + fed-bridge consume :8080 directly (not here)

import { Agent } from 'undici';
import { config } from '../config.js';
import type { JwkSet } from '../domain/types.js';

/** The Trust Anchor URL agents point their `authority_hints` at. */
export function trustAnchorUrl(): string {
  return config.inmor.trustAnchor;
}

export class InmorError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: unknown,
  ) {
    super(`Inmor ${path} -> ${status}: ${JSON.stringify(body)}`);
    this.name = 'InmorError';
  }
}

async function adminFetch<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.inmor.adminBaseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.inmor.apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new InmorError(res.status, path, parsed);
  return parsed as T;
}

// ---- Trust mark types (bootstrap the governance-stage catalog) ----

export interface TrustMarkTypeRecord {
  id: number;
  tmtype: string;
}

/** Create a trust mark type. Idempotent: Inmor returns 403 if it already exists — we treat
 *  that as success so setup can run repeatedly. */
export async function ensureTrustMarkType(tmtype: string): Promise<void> {
  try {
    await adminFetch<TrustMarkTypeRecord>('/trustmarktypes', 'POST', {
      tmtype,
      autorenew: true,
      valid_for: 8760,
    });
  } catch (e) {
    // 403 = resource exists (per Inmor error semantics). Anything else re-throws.
    if (e instanceof InmorError && e.status === 403) return;
    throw e;
  }
}

/** Look up a trust mark type id by its URL. Inmor's by-URL route is a non-standard GET-with-body,
 *  so we use the paginated list and filter client-side (the catalog is tiny). */
export async function getTrustMarkTypeId(tmtype: string): Promise<number | null> {
  const res = await adminFetch<{ items: TrustMarkTypeRecord[] }>('/trustmarktypes?limit=500', 'GET');
  return res.items.find((t) => t.tmtype === tmtype)?.id ?? null;
}

// ---- Trust marks (issue as governance gates clear) ----

export interface TrustMarkRecord {
  id: number;
  tmt: number;
  domain: string;
  mark: string; // signed JWT
  expire_at: string;
}

export async function issueTrustMark(args: {
  typeId: number;
  domain: string; // subject entity_id
  additionalClaims?: Record<string, unknown>;
  validForHours?: number;
}): Promise<TrustMarkRecord> {
  try {
    return await adminFetch<TrustMarkRecord>('/trustmarks', 'POST', {
      tmt: args.typeId,
      domain: args.domain,
      ...(args.validForHours !== undefined ? { valid_for: args.validForHours } : {}),
      ...(args.additionalClaims ? { additional_claims: args.additionalClaims } : {}),
    });
  } catch (e) {
    // Inmor is unique per (type, domain): re-issuing an existing (e.g. revoked) mark returns 403
    // with the existing record. On reapprove we reactivate + renew it to get a fresh signed JWT.
    if (e instanceof InmorError && e.status === 403 && e.body && typeof e.body === 'object' && 'id' in e.body) {
      const existingId = (e.body as { id: number }).id;
      await adminFetch<unknown>(`/trustmarks/${existingId}`, 'PUT', { active: true });
      return await adminFetch<TrustMarkRecord>(`/trustmarks/${existingId}/renew`, 'POST', {});
    }
    throw e;
  }
}

/** Revoke a trust mark (active:false). This is the certification-withdrawal actuator. */
export async function revokeTrustMark(id: number): Promise<void> {
  await adminFetch<unknown>(`/trustmarks/${id}`, 'PUT', { active: false });
}

// ---- Subordinates (publish the agent as a governed leaf) ----

export interface SubordinateRecord {
  id: number;
  entityid: string;
  active: boolean;
}

/** Register the agent leaf as a subordinate. Inmor VALIDATES by fetching the entity's
 *  /.well-known/openid-federation, so the leaf MUST already be published (ordering, issue 3). */
export async function createSubordinate(args: {
  entityId: string;
  metadata: Record<string, unknown>;
  jwks: JwkSet;
  forcedMetadata?: Record<string, unknown>;
  requiredTrustmarks?: string;
  additionalClaims?: Record<string, unknown>;
}): Promise<SubordinateRecord> {
  return adminFetch<SubordinateRecord>('/subordinates', 'POST', {
    entityid: args.entityId,
    metadata: args.metadata,
    forced_metadata: args.forcedMetadata ?? {},
    jwks: args.jwks,
    ...(args.requiredTrustmarks ? { required_trustmarks: args.requiredTrustmarks } : {}),
    ...(args.additionalClaims ? { additional_claims: args.additionalClaims } : {}),
  });
}

export async function getSubordinate(id: number): Promise<
  SubordinateRecord & { metadata: Record<string, unknown>; jwks: JwkSet; forced_metadata: Record<string, unknown> }
> {
  return adminFetch(`/subordinates/${id}`, 'GET');
}

/** Withdraw a subordinate (active:false). The update endpoint requires the full object, so we
 *  fetch current values and re-send them with active:false. NOTE: Inmor's /fetch keeps serving
 *  the cached statement even after this (soft flag; no Redis purge, no DELETE endpoint) — the
 *  authoritative withdrawal is the leaf 404 + revoked marks, which breaks the chain at the source. */
export async function deactivateSubordinate(id: number): Promise<void> {
  const current = await getSubordinate(id);
  await adminFetch<unknown>(`/subordinates/${id}`, 'POST', {
    metadata: current.metadata,
    forced_metadata: current.forced_metadata,
    jwks: current.jwks,
    active: false,
  });
}

/** Reactivate + refresh a subordinate (reapprove path): new jwks/metadata, active:true. */
export async function reactivateSubordinate(
  id: number,
  metadata: Record<string, unknown>,
  jwks: JwkSet,
): Promise<void> {
  await adminFetch<unknown>(`/subordinates/${id}`, 'POST', {
    metadata,
    forced_metadata: {},
    jwks,
    active: true,
  });
}

/** Preview an entity's published config before registering it (metadata, jwks, authority_hints,
 *  trust_marks). Handy to confirm the leaf is live + carries its marks. */
export async function fetchEntityConfig(url: string): Promise<{
  metadata: Record<string, unknown>;
  jwks: JwkSet;
  jwks_uri: string | null;
  authority_hints: string[];
  trust_marks: { trust_mark_type: string; trust_mark: string }[];
}> {
  return adminFetch('/subordinates/fetch-config', 'POST', { url });
}

// ---- Server ops ----

/** Ensure the Trust Anchor's own entity configuration exists (setup). */
export async function ensureServerEntity(): Promise<void> {
  await adminFetch<unknown>('/server/entity', 'POST', {});
}

// ---- Resolve (read/serve side, TA :8080) ----
// The TC surfaces the federation view (chain + verified marks) inside its own console so the
// demo never shows Inmor's UI. The TA is HTTPS self-signed in dev, so skip verification.

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export interface ResolveSummary {
  trustChainLength: number;
  verifiedMarkTypes: string[];
}

export async function resolveEntity(entityId: string): Promise<ResolveSummary | null> {
  try {
    const url = `${config.inmor.taBaseUrl}/resolve?sub=${encodeURIComponent(entityId)}&trust_anchor=${encodeURIComponent(config.inmor.trustAnchor)}`;
    const res = await fetch(url, { dispatcher: insecureAgent } as RequestInit);
    if (!res.ok) return null;
    const jwt = await res.text();
    const payloadB64 = jwt.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      trust_chain?: unknown[];
      trust_marks?: { trust_mark_type?: string }[];
    };
    return {
      trustChainLength: payload.trust_chain?.length ?? 0,
      verifiedMarkTypes: (payload.trust_marks ?? []).map((m) => m.trust_mark_type ?? '').filter(Boolean),
    };
  } catch {
    return null;
  }
}

// ---- Audit ----

export async function getAuditLog(params?: {
  resourceType?: string;
  limit?: number;
}): Promise<{ count: number; items: unknown[] }> {
  const q = new URLSearchParams();
  if (params?.resourceType) q.set('resource_type', params.resourceType);
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  const qs = q.toString();
  return adminFetch(`/auditlog${qs ? `?${qs}` : ''}`, 'GET');
}
