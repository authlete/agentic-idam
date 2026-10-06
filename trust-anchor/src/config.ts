// Environment-driven configuration. The reference Trust Anchor owns the public domain and holds
// only what it needs to relay to Vouch: which anchor (tenant) it fronts, where Vouch is, and the
// Bearer token to call it. No OpenID Federation protocol logic lives here.

function envString(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : Number(value);
}

export const config = {
  port: envNumber('PORT', 8095),
  vouch: {
    baseUrl: envString('VOUCH_BASE_URL', 'http://localhost:8094'),
    anchorId: envString('ANCHOR_ID', 'local-anchor'),
    bearerToken: envString('VOUCH_BEARER', 'dev-vouch-token'),
  },
} as const;
