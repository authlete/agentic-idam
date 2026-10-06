// entity-publisher entry point. Publishes agent leaf entity configurations and serves them at
// {entity_id}/.well-known/openid-federation (the URL the Trust Anchor fetches on POST /subordinates and
// Authlete fetches during native resolution).

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { config } from './config.js';
import { buildLeaf } from './leaf.js';
import { landingPage } from './page.js';
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

// A friendly landing at the entity_id itself (see page.ts). Not published -> 404.
app.get('/agents/:slug', (c) => {
  const leaf = store.getBySlug(c.req.param('slug'));
  if (!leaf) return c.json({ error: 'not_found' }, 404);
  return c.html(landingPage(leaf));
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`entity-publisher listening on http://localhost:${info.port}`);
});
