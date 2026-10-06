// Setup + health routes. Bootstraps the governance-stage trust mark catalog through Vouch.

import { Hono } from 'hono';
import * as vouch from '../clients/vouch.js';
import { pingRedis } from '../infra/redis.js';
import { ALL_TRUST_MARK_TYPE_URLS } from '../domain/trustMarkCatalog.js';

export const setup = new Hono();

setup.get('/health', async (c) => {
  const redis = await pingRedis();
  return c.json({ ok: redis, redis, service: 'trust-controller' });
});

/** Bootstrap: ensure all governance-stage trust mark types, THEN (re)generate the anchor entity
 *  config. Order matters — the anchor entity configuration auto-includes ACTIVE trust mark types in
 *  its `trust_mark_issuers`, so the types must exist before the entity config is built, or
 *  /resolve will drop the marks (verified but unrecognized issuer). */
setup.post('/bootstrap', async (c) => {
  for (const url of ALL_TRUST_MARK_TYPE_URLS) {
    await vouch.ensureTrustMarkType(url);
  }
  await vouch.ensureServerEntity();
  return c.json({ ok: true, trustMarkTypes: ALL_TRUST_MARK_TYPE_URLS });
});
