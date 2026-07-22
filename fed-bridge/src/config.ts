// Environment-driven configuration. Explicit defaults so the service runs locally
// out of the box (Trust Controller on :8091, Inmor TA on :8080, our Redis on :6380).

// Read an env var, falling back to a default when it is unset or empty.
function envString(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : Number(value);
}

// Trust-anchor JWKS (JSON) — the anchor's public keys the bridge verifies every trust chain
// against. Configured out-of-band; required for verification (the bridge fails closed without it).
function envJwks(name: string): { keys: Record<string, unknown>[] } | null {
  const value = process.env[name];
  if (!value) return null;
  try {
    return JSON.parse(value) as { keys: Record<string, unknown>[] };
  } catch {
    return null;
  }
}

export const config = {
  port: envNumber('PORT', 8093),
  redis: {
    url: envString('REDIS_URL', 'redis://localhost:6380'),
    db: { streams: envNumber('REDIS_DB_STREAMS', 1), store: envNumber('REDIS_DB_STORE', 4) },
  },
  tcBaseUrl: envString('TC_BASE_URL', 'http://localhost:8091'),
  inmorTaUrl: envString('INMOR_TA_URL', 'https://localhost:8080'),
  // The trust anchor's public keys — the bridge verifies resolved trust chains against these
  // (zero-trust: integrity comes from these signatures, not from the /resolve transport).
  trustAnchorJwks: envJwks('TRUST_ANCHOR_JWKS'),

  // Standard OAuth Dynamic Client Registration (RFC 7591) + management (RFC 7592).
  // Build against any DCR endpoint (Authlete now, Ping later) — same code.
  dcr: {
    registrationEndpoint: envString('DCR_REGISTRATION_ENDPOINT', 'http://localhost:3000/api/register'),
    // RFC 7591 initial access token (bearer). Empty = send none.
    initialAccessToken: envString('DCR_INITIAL_ACCESS_TOKEN', ''),
    // token_endpoint_auth_method registered for the agent's client (configurable per demo).
    // 'private_key_jwt' = portable (works on Ping too). 'spiffe_jwt' = Authlete-native (later).
    tokenAuthMethod: envString('DCR_TOKEN_AUTH_METHOD', 'private_key_jwt'),
  },
} as const;
