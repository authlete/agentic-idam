// OpenID Federation endpoints. The Trust Controller is the Trust Anchor, so it serves the standard
// federation endpoints here. Each is a thin relay to a Vouch serve op: forward the raw request
// parameters and return Vouch's response (body + status + content-type) verbatim. No protocol logic
// lives here; Vouch (and the engine behind it) does the work.

import { Hono } from 'hono';
import type { Context } from 'hono';
import { callServe } from '../clients/vouch.js';

export const federation = new Hono();

async function relay(c: Context, op: string, parameters: string): Promise<Response> {
  const env = await callServe(op, parameters);
  return c.body(env.responseContent, env.httpStatus as 200, { 'Content-Type': env.contentType });
}

const rawQuery = (c: Context): string => new URL(c.req.url).search.replace(/^\?/, '');

federation.get('/.well-known/openid-federation', (c) => relay(c, 'entity-configuration', ''));
federation.get('/fetch', (c) => relay(c, 'fetch', rawQuery(c)));
federation.get('/list', (c) => relay(c, 'list', rawQuery(c)));
federation.get('/resolve', (c) => relay(c, 'resolve', rawQuery(c)));
federation.get('/trust_mark', (c) => relay(c, 'trust-mark', rawQuery(c)));
federation.post('/trust_mark_status', async (c) => relay(c, 'trust-mark-status', await c.req.text()));
federation.get('/trust_mark_list', (c) => relay(c, 'trust-mark-list', rawQuery(c)));
federation.get('/historical_keys', (c) => relay(c, 'historical-keys', ''));
