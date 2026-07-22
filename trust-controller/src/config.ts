// Environment-driven configuration. Explicit defaults so the service runs locally
// out of the box (Inmor on :8000/:8080, our Redis on :6380).

// Read an env var, falling back to a default when it is unset or empty.
function envString(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : Number(value);
}

export const config = {
  port: envNumber('PORT', 8091),
  tcBaseUrl: envString('TC_BASE_URL', 'http://localhost:8091'),

  redis: {
    url: envString('REDIS_URL', 'redis://localhost:6380'),
    db: {
      streams: envNumber('REDIS_DB_STREAMS', 1),
      store: envNumber('REDIS_DB_STORE', 2),
    },
  },

  inmor: {
    adminBaseUrl: envString('INMOR_ADMIN_URL', 'http://localhost:8000/api/v1'),
    taBaseUrl: envString('INMOR_TA_URL', 'http://localhost:8080'),
    apiKey: envString('INMOR_API_KEY', ''),
    trustAnchor: envString('INMOR_TRUST_ANCHOR', 'http://localhost:8080'),
  },

  entityPublisher: {
    baseUrl: envString('ENTITY_PUBLISHER_URL', 'http://localhost:8092'),
  },

  federation: {
    // Agent leaf entity_ids are minted under this base (served by the entity-publisher).
    agentBaseUrl: envString('AGENT_BASE_URL', 'http://localhost:8092/agents'),
  },
} as const;

export type Config = typeof config;
