// Environment-driven configuration. Explicit defaults so the service runs locally out of the box.
//
// The Trust Controller governs through Vouch (the control-plane API engine) and reads the
// published federation view from the public reference Trust Anchor's /resolve. It never talks to
// the federation engine directly.

function envString(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : Number(value);
}

const tcBaseUrl = envString('TC_BASE_URL', 'http://localhost:8091');

export const config = {
  port: envNumber('PORT', 8091),
  tcBaseUrl,

  redis: {
    url: envString('REDIS_URL', 'redis://localhost:6380'),
    db: {
      streams: envNumber('REDIS_DB_STREAMS', 1),
      store: envNumber('REDIS_DB_STORE', 2),
    },
  },

  // Vouch — the API the TC calls for both management and serve operations.
  vouch: {
    baseUrl: envString('VOUCH_BASE_URL', 'http://localhost:8094'),
    bearer: envString('VOUCH_BEARER', 'dev-vouch-token'),
    anchorId: envString('ANCHOR_ID', 'local-anchor'),
  },

  // The anchor's public entity_id (agents' authority_hints + the /resolve trust_anchor). The Trust
  // Controller IS the Trust Anchor, so this defaults to the TC's own base; override only if the
  // federation endpoints are published on a different host.
  anchor: {
    entityId: envString('TRUST_ANCHOR_ENTITY_ID', tcBaseUrl),
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
