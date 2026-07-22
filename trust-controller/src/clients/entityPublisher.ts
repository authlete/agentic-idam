// Client to the entity-publisher service. The Trust Controller tells it to publish
// an agent's leaf entity configuration (embedding issued trust marks + authority_hints), then
// waits for confirmation that the leaf is LIVE + reachable before creating the subordinate
// (synchronous command chain).
//
// Two ways to source the leaf:
//   1. Point at a pre-published leaf via the `leafOverride` on the approve request.
//   2. Call POST {ENTITY_PUBLISHER_URL}/publish on the entity-publisher.

import { config } from '../config.js';
import type { JwkSet } from '../domain/types.js';

export interface PublishRequest {
  entityId: string;
  authorityHints: string[];
  trustMarks: { trust_mark_type: string; trust_mark: string }[];
  /** RP metadata (openid_relying_party) the TC wants embedded in the leaf. */
  metadata: Record<string, unknown>;
}

export interface PublishResult {
  /** The leaf's published public keys (to reuse in POST /subordinates). */
  jwks: JwkSet;
  /** URL of the published /.well-known/openid-federation. */
  wellKnownUrl: string;
  /** Metadata the leaf published (openid_relying_party etc.). */
  metadata: Record<string, unknown>;
}

export async function publishLeaf(req: PublishRequest): Promise<PublishResult> {
  const res = await fetch(`${config.entityPublisher.baseUrl}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`entity-publisher /publish -> ${res.status}: ${body}`);
  }
  return (await res.json()) as PublishResult;
}

/** Withdraw the leaf so its /.well-known/openid-federation returns 404 (breaks the chain at the
 *  source). Best-effort: a withdrawal must not fail because the leaf was already gone. */
export async function withdrawLeaf(entityId: string): Promise<void> {
  try {
    await fetch(`${config.entityPublisher.baseUrl}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId }),
    });
  } catch {
    // entity-publisher down / already withdrawn — don't block the lifecycle transition.
  }
}
