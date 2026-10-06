// entity-publisher entry point. Publishes agent leaf entity configurations and serves them at
// {entity_id}/.well-known/openid-federation (the URL the Trust Anchor fetches on POST /subordinates and
// Authlete fetches during native resolution).

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { config } from './config.js';
import { buildLeaf } from './leaf.js';
import * as store from './store.js';

const app = new Hono();

// Turn a failed request-body validation into a clean 400 instead of Hono's default 500.
app.onError((err, c) => {
  if (err instanceof z.ZodError) return c.json({ error: 'invalid_request', issues: err.issues }, 400);
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

app.get('/', (c) => c.json({ service: 'entity-publisher', ok: true, leaves: store.count() }));

const publishSchema = z.object({
  entityId: z.string().url(),
  authorityHints: z.array(z.string()).optional(),
  trustMarks: z
    .array(z.object({ trust_mark_type: z.string(), trust_mark: z.string() }))
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

const withdrawSchema = z.object({ entityId: z.string().url() });

// POST /publish — generate a per-agent keypair, build + sign the leaf entity config (embedding
// the issued trust marks), store it, and return the public jwks + well-known URL. Synchronous:
// when this returns, the leaf is live and reachable (so the TC can then POST /subordinates).
app.post('/publish', async (c) => {
  const body = publishSchema.parse(await c.req.json());
  const record = await buildLeaf({
    entityId: body.entityId,
    // The Trust Controller always supplies authority_hints (the anchor it governs under).
    authorityHints: body.authorityHints ?? [],
    trustMarks: body.trustMarks ?? [],
    metadata: body.metadata ?? { openid_relying_party: {} },
  });
  store.put(record);
  return c.json({
    jwks: { keys: [record.publicJwk] },
    wellKnownUrl: `${record.entityId}/.well-known/openid-federation`,
    metadata: record.metadata,
  });
});

// POST /reset — clear ALL published leaves (used by the cleanup script so it needn't restart us).
app.post('/reset', (c) => c.json({ cleared: store.clear() }));

// POST /withdraw — stop serving an agent's leaf config (revoke/retire/suspend). After this its
// /.well-known/openid-federation returns 404, so the trust chain can't be built.
app.post('/withdraw', async (c) => {
  const { entityId } = withdrawSchema.parse(await c.req.json());
  const removed = store.remove(entityId);
  return c.json({ withdrawn: removed, entityId });
});

// The leaf entity configuration. entity_id = {PUBLIC_BASE_URL}/agents/<slug>, so this serves
// {entity_id}/.well-known/openid-federation.
app.get('/agents/:slug/.well-known/openid-federation', (c) => {
  const leaf = store.getBySlug(c.req.param('slug'));
  if (!leaf) return c.json({ error: 'not_found' }, 404);
  return c.body(leaf.jwt, 200, { 'content-type': 'application/entity-statement+jwt' });
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
}

// A friendly landing at the entity_id itself. The entity_id is only an identifier in OpenID
// Federation (resolvers use the /.well-known path), but a small page here beats a bare 404 and
// confirms the entity is live. Not published -> 404. PUBLIC info only — never the private key.
app.get('/agents/:slug', (c) => {
  const leaf = store.getBySlug(c.req.param('slug'));
  if (!leaf) return c.json({ error: 'not_found' }, 404);
  const rp = (leaf.metadata.openid_relying_party ?? {}) as Record<string, unknown>;
  const name = typeof rp.client_name === 'string' ? rp.client_name : leaf.entityId;
  const wellKnown = `${leaf.entityId}/.well-known/openid-federation`;
  return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title>
<style>
  body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#23233b;background:#fbfaf7;margin:0;padding:48px}
  .card{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e6e2d9;border-radius:12px;padding:28px 32px}
  .kicker{color:#7a7a8c;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:14px}
  h1{font-size:22px;margin:0 0 6px}
  .id{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#555;word-break:break-all}
  a{color:#2f4b7c}
</style></head>
<body><div class="card">
  <div class="kicker">Agent entity</div>
  <h1>${escapeHtml(name)}</h1>
  <div class="id">${escapeHtml(leaf.entityId)}</div>
  <p><a href="${escapeHtml(wellKnown)}">OpenID Federation entity configuration &rarr;</a></p>
</div></body></html>`);
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`entity-publisher listening on http://localhost:${info.port}`);
});
