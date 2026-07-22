// trust-controller entry point. Hono app; the control-plane API (functions 1/2/4/5) and the
// sole caller of Inmor's Admin API. Runtime (Authlete) and read/serve (Inmor TA) are elsewhere.
//
// Layout — src/ holds only this entry point and config; everything else lives by purpose:
//   domain/    pure model: Agent Identity types, lifecycle state machine, trust mark catalog
//   routes/    HTTP in — the control-plane API surface
//   services/  orchestration: onboarding (manifest -> identity), governance (transitions)
//   store/     persistence: Agent Identity system-of-record (Redis)
//   clients/   HTTP out: Inmor Admin API facade, entity-publisher client
//   infra/     plumbing: Redis connections, lifecycle event bus (Streams producer)
//   shared/    the event contract fed-bridge consumes (keep both copies in sync)

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config.js';
import { setup } from './routes/setup.js';
import { identities } from './routes/identities.js';
import { InmorError } from './clients/inmor.js';
import { closeRedis } from './infra/redis.js';

const app = new Hono();

app.use('*', cors()); // demo: allow the console UI (localhost:8090) to call directly
app.get('/', (c) => c.json({ service: 'trust-controller', ok: true }));
app.route('/setup', setup);
app.route('/identities', identities);

// Surface Inmor failures as 502 (upstream) with context, so the UI can show what broke.
app.onError((err, c) => {
  if (err instanceof InmorError) {
    return c.json({ error: 'inmor_error', status: err.status, path: err.path, detail: err.body }, 502);
  }
  console.error(err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`trust-controller listening on http://localhost:${info.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await closeRedis();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
