// Setup + health routes. Bootstraps the governance-stage trust mark catalog into Inmor.

import { Hono } from 'hono';
import * as inmor from '../clients/inmor.js';
import { pingRedis } from '../infra/redis.js';
import { ALL_TRUST_MARK_TYPE_URLS } from '../domain/trustMarkCatalog.js';

export const setup = new Hono();

setup.get('/health', async (c) => {
  const redis = await pingRedis();
  return c.json({ ok: redis, redis, service: 'trust-controller' });
});

/** Bootstrap: ensure all governance-stage trust mark types, THEN (re)generate the TA entity
 *  config. Order matters — create_server_statement() auto-includes ACTIVE trust mark types in
 *  the TA's `trust_mark_issuers`, so the types must exist before the entity config is built, or
 *  /resolve will drop the marks (verified but unrecognized issuer). */
setup.post('/bootstrap', async (c) => {
  for (const url of ALL_TRUST_MARK_TYPE_URLS) {
    await inmor.ensureTrustMarkType(url);
  }
  await inmor.ensureServerEntity();
  return c.json({ ok: true, trustMarkTypes: ALL_TRUST_MARK_TYPE_URLS });
});
