// Agent Identity routes — onboarding (Manifest handoff), listing/detail (for the TC UI),
// governance gates, and lifecycle transitions.

import { Hono } from 'hono';
import { z } from 'zod';
import * as store from '../store/agentIdentityStore.js';
import * as governance from '../services/governance.js';
import * as inmor from '../clients/inmor.js';
import { onboardFromManifest } from '../services/onboarding.js';
import { InvalidTransitionError } from '../domain/stateMachine.js';
import type { LifecycleState } from '../domain/types.js';

export const identities = new Hono();

const manifestSchema = z.object({
  agentRef: z.string().min(1),
  displayName: z.string().min(1),
  owner: z.object({ subject: z.string().min(1), team: z.string().optional() }),
  environment: z.enum(['sandbox', 'production']).optional(),
  capabilities: z.array(z.string()).optional(),
  delegationRequested: z.boolean().optional(),
  redirectUris: z.array(z.string()).optional(),
  jwks: z.object({ keys: z.array(z.record(z.unknown())) }).optional(),
});

/** POST /identities — the Manifest handoff. Derives an Agent Identity (pending_approval). */
identities.post('/', async (c) => {
  const parsed = manifestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'invalid manifest', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400);
  }
  const ai = await onboardFromManifest(parsed.data);
  return c.json(ai, 201);
});

const STATES: LifecycleState[] = ['pending_approval', 'approved', 'suspended', 'revoked', 'retired'];

/** GET /identities?state=approved — list all or filter by lifecycle state. */
identities.get('/', async (c) => {
  const state = c.req.query('state');
  if (state) {
    if (!STATES.includes(state as LifecycleState)) return c.json({ error: 'invalid state' }, 400);
    return c.json(await store.listByState(state as LifecycleState));
  }
  return c.json(await store.listAll());
});

/** GET /identities/:entityId/federation — the resolved trust chain + verified marks, surfaced
 *  from Inmor through the TC (so the console shows the federation view without exposing Inmor).
 *  Registered BEFORE the greedy `/:entityId` GET so it isn't swallowed. */
identities.get('/:entityId/federation', async (c) => {
  const raw = decodeURIComponent(c.req.param('entityId'));
  const entityId = raw.replace(/\/federation$/, '');
  const summary = await inmor.resolveEntity(entityId);
  return summary ? c.json(summary) : c.json({ resolvable: false }, 200);
});

identities.get('/:entityId', async (c) => {
  const ai = await store.get(decodeURIComponent(c.req.param('entityId')));
  return ai ? c.json(ai) : c.json({ error: 'not found' }, 404);
});

const bindingSchema = z.object({
  clientId: z.string().optional(),
  registrationClientUri: z.string().optional(),
  spiffeId: z.string().optional(),
});

/** POST /identities/:entityId/binding — fed-bridge reports the DCR-assigned client_id back so the
 *  Agent Identity records the entity_id -> client_id binding (the Client Representation layer). */
identities.post('/:entityId/binding', async (c) => {
  const entityId = decodeURIComponent(c.req.param('entityId'));
  const body = bindingSchema.parse(await c.req.json());
  const ai = await store.get(entityId);
  if (!ai) return c.json({ error: 'not found' }, 404);
  const from = ai.lifecycleState;
  ai.downstream = { ...ai.downstream, ...body };
  await store.save(ai, from);
  return c.json(ai);
});

const gateSchema = z.object({ type: z.string().url() });

/** POST /identities/:entityId/gate — issue a governance-gate trust mark (stays pending). */
identities.post('/:entityId/gate', async (c) => {
  const entityId = decodeURIComponent(c.req.param('entityId'));
  const body = gateSchema.parse(await c.req.json());
  const ai = await governance.gate(entityId, body.type);
  return c.json(ai);
});

/** POST /identities/:entityId/transition/:action — approve | suspend | reapprove | revoke | retire
 *  (bodyless POST; no body is read, so a browser's Content-Length: 0 is fine). */
identities.post('/:entityId/transition/:action', async (c) => {
  const entityId = decodeURIComponent(c.req.param('entityId'));
  const action = c.req.param('action');
  try {
    switch (action) {
      case 'approve':
        return c.json(await governance.approve(entityId));
      case 'suspend':
        return c.json(await governance.suspend(entityId));
      case 'reapprove':
        return c.json(await governance.reapprove(entityId));
      case 'revoke':
        return c.json(await governance.revoke(entityId));
      case 'retire':
        return c.json(await governance.retire(entityId));
      default:
        return c.json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    if (e instanceof InvalidTransitionError) return c.json({ error: e.message }, 409);
    if (e instanceof governance.NotFoundError) return c.json({ error: e.message }, 404);
    throw e;
  }
});
