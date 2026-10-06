// The only outbound dependency: Vouch serve operations. Each call forwards the raw request
// parameters and returns the envelope that the relay handler passes straight back to the caller.

import { config } from './config.js';

export interface ServeEnvelope {
  action: string;
  httpStatus: number;
  contentType: string;
  responseContent: string;
}

/** Call a Vouch serve op for this anchor, forwarding the raw request parameters verbatim. */
export async function callServe(op: string, parameters: string): Promise<ServeEnvelope> {
  const url = `${config.vouch.baseUrl}/v1/anchors/${encodeURIComponent(config.vouch.anchorId)}/${op}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.vouch.bearerToken}` },
    body: JSON.stringify({ parameters }),
  });
  if (!res.ok) {
    // Vouch itself failed (auth/unknown anchor/etc.) — surface as a 502 so it's distinguishable
    // from an OpenID Federation protocol error (which arrives inside a 200 envelope).
    const detail = await res.text();
    return { action: 'SERVER_ERROR', httpStatus: 502, contentType: 'application/json', responseContent: detail || '{"error":"vouch_unavailable"}' };
  }
  return (await res.json()) as ServeEnvelope;
}
