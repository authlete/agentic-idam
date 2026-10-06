// Governance orchestration (governance/certification and lifecycle orchestration acting on the
// Agent Trust Identity). Runs the side-effects a
// lifecycle transition implies: issue/revoke trust marks via Vouch, publish/withdraw the leaf,
// create/withdraw the subordinate, emit lifecycle events. The state machine (pure) decides IF a
// transition is legal; this decides WHAT happens.
//
// PUBLISH (approve / reapprove) and WITHDRAW (suspend / revoke / retire) are symmetric:
//   publish : issue cert marks -> publish leaf (marks embedded) -> create/reactivate subordinate
//   withdraw: revoke marks -> deactivate subordinate -> withdraw leaf (404, breaks the chain)
//
// APPROVE ordering (the anchor validates the leaf on subordinate creation): marks -> leaf ->
// subordinate, with retry to absorb propagation lag.

import { emit } from '../infra/eventBus.js';
import * as store from '../store/agentIdentityStore.js';
import * as vouch from '../clients/vouch.js';
import { publishLeaf, withdrawLeaf } from '../clients/entityPublisher.js';
import { nextState, type LifecycleTransition } from '../domain/stateMachine.js';
import { TRUST_MARK_TYPES } from '../domain/trustMarkCatalog.js';
import type { AgentIdentity, IssuedMark, LifecycleState } from '../domain/types.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class NotFoundError extends Error {
  constructor(entityId: string) {
    super(`Agent Identity not found: ${entityId}`);
    this.name = 'NotFoundError';
  }
}

async function load(entityId: string): Promise<AgentIdentity> {
  const ai = await store.get(entityId);
  if (!ai) throw new NotFoundError(entityId);
  return ai;
}

function audit(ai: AgentIdentity, action: string, detail?: Record<string, unknown>): void {
  ai.audit.push({ at: new Date().toISOString(), action, ...(detail ? { detail } : {}) });
}

// ---- Trust marks ----
// Vouch resolves a trust-mark type URL to the underlying record itself, so the TC issues purely
// by type URL + subject.

async function issueMark(ai: AgentIdentity, typeUrl: string): Promise<IssuedMark> {
  const rec = await vouch.issueTrustMark({ type: typeUrl, sub: ai.entityId });
  // Keep one IssuedMark per type: update the existing (revoked) entry on reapprove, else add.
  const existing = ai.marks.find((m) => m.type === typeUrl);
  if (existing) {
    existing.markId = rec.id;
    existing.jwt = rec.trustMark;
    existing.status = 'active';
    existing.issuedAt = new Date().toISOString();
    return existing;
  }
  const mark: IssuedMark = { markId: rec.id, type: typeUrl, jwt: rec.trustMark, status: 'active', issuedAt: new Date().toISOString() };
  ai.marks.push(mark);
  return mark;
}

async function revokeAllMarks(ai: AgentIdentity): Promise<void> {
  for (const m of ai.marks) {
    if (m.status === 'active') {
      await vouch.revokeTrustMark(m.markId);
      m.status = 'revoked';
    }
  }
}

async function issueCertMarks(ai: AgentIdentity): Promise<void> {
  await issueMark(ai, TRUST_MARK_TYPES.agentCertified);
  await issueMark(ai, ai.environment === 'production' ? TRUST_MARK_TYPES.productionApproved : TRUST_MARK_TYPES.sandboxOnly);
  if (ai.capability.delegationPermitted) await issueMark(ai, TRUST_MARK_TYPES.delegationPermitted);
}

/** Issue a single governance-gate mark without changing lifecycle state (stays pending). */
export async function gate(entityId: string, typeUrl: string): Promise<AgentIdentity> {
  const ai = await load(entityId);
  await issueMark(ai, typeUrl);
  audit(ai, 'gate', { type: typeUrl });
  await store.save(ai);
  await emit('certified', { entityId, agentRef: ai.agentRef, state: ai.lifecycleState, at: new Date().toISOString(), detail: { type: typeUrl } });
  return ai;
}

// ---- Publish + withdraw (symmetric) ----

async function publishAndRegister(ai: AgentIdentity): Promise<void> {
  const trustMarks = ai.marks
    .filter((m) => m.status === 'active')
    .map((m) => ({ trust_mark_type: m.type, trust_mark: m.jwt }));
  const metadata = defaultLeafMetadata(ai);
  const published = await publishLeaf({
    entityId: ai.entityId,
    authorityHints: [vouch.trustAnchorUrl()],
    trustMarks,
    metadata,
  });
  ai.jwks = published.jwks;

  if (ai.downstream.federationSubordinateId !== undefined) {
    // reapprove: the subordinate exists (deactivated) — reactivate with fresh keys.
    const subId = ai.downstream.federationSubordinateId;
    await withRetry(() => vouch.reactivateSubordinate(subId, metadata, published.jwks));
  } else {
    const sub = await withRetry(() =>
      vouch.createSubordinate({
        entityId: ai.entityId,
        metadata,
        jwks: published.jwks,
        requiredTrustMarks: TRUST_MARK_TYPES.agentCertified,
      }),
    );
    ai.downstream.federationSubordinateId = sub.id;
  }
}

async function withdrawAll(ai: AgentIdentity, from: LifecycleState): Promise<void> {
  await revokeAllMarks(ai); // idempotent: skips already-revoked marks
  // Deactivate the subordinate ONLY from `approved` (the only state with a live subordinate).
  // The anchor re-fetches the leaf to re-validate on update, so once the leaf is 404 (already
  // withdrawn on a prior suspend/revoke) a second deactivate would fail. Guard on the source state.
  if (from === 'approved' && ai.downstream.federationSubordinateId !== undefined) {
    await vouch.deactivateSubordinate(ai.downstream.federationSubordinateId);
  }
  await withdrawLeaf(ai.entityId); // leaf /.well-known -> 404, breaks the chain at the source
}

// ---- Transitions ----

export async function approve(entityId: string): Promise<AgentIdentity> {
  return publishTransition(entityId, 'approve', 'approved');
}

export async function reapprove(entityId: string): Promise<AgentIdentity> {
  return publishTransition(entityId, 'reapprove', 'reapproved');
}

async function publishTransition(entityId: string, transition: 'approve' | 'reapprove', auditAction: string): Promise<AgentIdentity> {
  const ai = await load(entityId);
  const from = ai.lifecycleState;
  const to = nextState(from, transition); // guards: throws if illegal
  await issueCertMarks(ai);
  await publishAndRegister(ai);
  ai.lifecycleState = to;
  audit(ai, auditAction, { subordinateId: ai.downstream.federationSubordinateId });
  await store.save(ai, from);
  await emit('published', { entityId, agentRef: ai.agentRef, state: to, at: new Date().toISOString(), detail: { subordinateId: ai.downstream.federationSubordinateId } });
  return ai;
}

export async function suspend(entityId: string): Promise<AgentIdentity> {
  return withdrawTransition(entityId, 'suspend', 'suspended');
}

export async function revoke(entityId: string): Promise<AgentIdentity> {
  return withdrawTransition(entityId, 'revoke', 'revoked');
}

export async function retire(entityId: string): Promise<AgentIdentity> {
  return withdrawTransition(entityId, 'retire', 'retired');
}

async function withdrawTransition(
  entityId: string,
  transition: Extract<LifecycleTransition, 'suspend' | 'revoke' | 'retire'>,
  eventType: 'suspended' | 'revoked' | 'retired',
): Promise<AgentIdentity> {
  const ai = await load(entityId);
  const from = ai.lifecycleState;
  const to = nextState(from, transition);
  await withdrawAll(ai, from);
  ai.lifecycleState = to;
  audit(ai, to);
  await store.save(ai, from);
  await emit(eventType, { entityId, agentRef: ai.agentRef, state: to, at: new Date().toISOString() });
  return ai;
}

// ---- helpers ----

function defaultLeafMetadata(ai: AgentIdentity): Record<string, unknown> {
  const grantTypes = ['authorization_code', 'refresh_token'];
  if (ai.capability.delegationPermitted) grantTypes.push('urn:ietf:params:oauth:grant-type:token-exchange');
  return {
    openid_relying_party: {
      client_name: ai.displayName,
      application_type: 'web',
      client_registration_types: ['automatic'],
      redirect_uris: ai.redirectUris ?? ['http://localhost:5173/callback'],
      response_types: ['code'],
      grant_types: grantTypes,
      token_endpoint_auth_method: 'private_key_jwt',
      id_token_signed_response_alg: 'RS256',
      scope: 'openid profile email',
      // jwks (client auth keys) is injected by entity-publisher after it generates the keypair.
    },
  };
}

// Retry transient failures: a 400 while the freshly-published leaf is still propagating (the anchor
// validates it on subordinate creation), or a 5xx upstream blip. Other 4xx are terminal.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 750): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof vouch.VouchError && (e.status === 400 || e.status >= 500);
      if (!retryable) throw e;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw lastErr;
}
