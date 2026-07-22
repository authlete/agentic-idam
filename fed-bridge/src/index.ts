// fed-bridge entry point. Runs the lifecycle-event consumer and exposes an inspection API so the
// console UI can show what the bridge built/registered per agent.

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config.js';
import * as store from './store.js';
import { runConsumer } from './consumer.js';

const app = new Hono();

app.use('*', cors()); // demo: allow the console UI to read bridge records
app.get('/', (c) => c.json({ service: 'fed-bridge', ok: true }));

/** What the bridge built/registered per agent (for the console UI). */
app.get('/clients', async (c) => c.json(await store.list()));
app.get('/clients/:entityId{.+}', async (c) => {
  const rec = await store.get(decodeURIComponent(c.req.param('entityId')));
  return rec ? c.json(rec) : c.json({ error: 'not_found' }, 404);
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`fed-bridge listening on http://localhost:${info.port}`);
});

// Start the consumer loop (fire-and-forget; it self-restarts on errors).
void runConsumer();
