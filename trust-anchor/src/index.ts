// Reference Trust Anchor — a thin, customizable OpenID Federation front door. It owns the public
// entity_id domain and exposes the standard federation endpoints, but does NO protocol work: each
// endpoint forwards the raw request to a Vouch serve op and relays Vouch's fully-formed response
// (body + status + content-type) verbatim. Caching, authz, and logging would wrap this relay.
//
// This file is deliberately boring: one relay helper, one line per endpoint.

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { config } from './config.js';
import { callServe } from './vouch.js';

const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true, service: 'trust-anchor', anchorId: config.vouch.anchorId }));

/** Relay a request to a Vouch serve op and return its response verbatim. `parameters` is the raw
 *  query string (GET) or form body (POST) — forwarded without interpretation. */
async function relay(c: Context, op: string, parameters: string): Promise<Response> {
  const env = await callServe(op, parameters);
  return c.body(env.responseContent, env.httpStatus as 200, { 'Content-Type': env.contentType });
}

const rawQuery = (c: Context): string => new URL(c.req.url).search.replace(/^\?/, '');

// Standard OpenID Federation endpoints. Each is a one-line relay to the matching Vouch serve op.
app.get('/.well-known/openid-federation', (c) => relay(c, 'entity-configuration', ''));
app.get('/fetch', (c) => relay(c, 'fetch', rawQuery(c)));
app.get('/list', (c) => relay(c, 'list', rawQuery(c)));
app.get('/resolve', (c) => relay(c, 'resolve', rawQuery(c)));
app.get('/trust_mark', (c) => relay(c, 'trust-mark', rawQuery(c)));
app.post('/trust_mark_status', async (c) => relay(c, 'trust-mark-status', await c.req.text()));
app.get('/trust_mark_list', (c) => relay(c, 'trust-mark-list', rawQuery(c)));
app.get('/historical_keys', (c) => relay(c, 'historical-keys', ''));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`trust-anchor (reference) listening on http://localhost:${info.port} -> vouch ${config.vouch.baseUrl} anchor ${config.vouch.anchorId}`);
});
