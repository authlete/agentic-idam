// Zero-trust trust-chain verification for the Federation Bridge.
//
// The `published` event is only a trigger carrying an entity_id. The bridge does NOT trust the
// event, the Trust Controller's JSON, or the /resolve transport. It independently verifies the
// OpenID Federation trust chain — every entity statement's signature — against the trust anchor's
// configured public keys (TRUST_ANCHOR_JWKS). Only a chain that verifies to those keys provisions.
//
// A chain is ordered [leaf entity config, subordinate statement(s)…, trust anchor entity config].
// Each statement is verified with the keys published by the statement above it; the last (the TA's
// self-signed config) must verify against the configured anchor keys.

import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import { config } from './config.js';

export interface VerifiedChain {
  entityId: string; // verified leaf subject (iss == sub)
  metadata: Record<string, unknown>;
  trustMarkTypes: string[]; // trust-mark types whose JWTs verified against the anchor
}

interface Statement {
  iss?: string;
  sub?: string;
  jwks?: JSONWebKeySet;
  metadata?: Record<string, unknown>;
  trust_marks?: { trust_mark_type?: string; trust_mark?: string }[];
}

function statementAt(chain: string[], i: number): string {
  const jwt = chain[i];
  if (!jwt) throw new Error('malformed trust chain (missing statement)');
  return jwt;
}

async function verifyWith(jwt: string, jwks: JSONWebKeySet): Promise<Statement> {
  const { payload } = await jwtVerify(jwt, createLocalJWKSet(jwks));
  return payload as Statement;
}

// The trust anchor: its entity id + the public keys we verify against. Configured out-of-band
// via TRUST_ANCHOR_JWKS — without it we cannot verify anything, so we fail closed.
function trustAnchor(): { entityId: string; jwks: JSONWebKeySet } {
  if (!config.trustAnchorJwks) {
    throw new Error('TRUST_ANCHOR_JWKS is not set — cannot verify trust chains without the anchor public keys');
  }
  return { entityId: config.inmorTaUrl, jwks: config.trustAnchorJwks as JSONWebKeySet };
}

/** Verify a trust chain to the configured trust anchor. Throws if any signature or link fails. */
export async function verifyTrustChain(chain: string[]): Promise<VerifiedChain> {
  console.log(`[bridge] verifying trust chain of length ${chain.length} against anchor ${trustAnchor().entityId}`);
  if (chain.length < 2) throw new Error('trust chain too short');
  const anchor = trustAnchor();

  // 1. The chain root (TA entity config) must be self-issued and signed by the anchor keys.
  const root = await verifyWith(statementAt(chain, chain.length - 1), anchor.jwks);
  if (root.iss !== root.sub || root.iss !== anchor.entityId || !root.jwks) {
    throw new Error('trust anchor statement is not self-issued by the configured anchor');
  }

  // 2. Walk down: each statement is verified by the jwks published in the statement above it.
  let superiorKeys = root.jwks;
  for (let i = chain.length - 2; i >= 1; i--) {
    const stmt = await verifyWith(statementAt(chain, i), superiorKeys);
    if (!stmt.jwks) throw new Error('subordinate statement is missing the subject jwks');
    superiorKeys = stmt.jwks; // keys attested for the entity one level down
  }

  // 3. The leaf is self-signed with the keys its superior attested.
  const leaf = await verifyWith(statementAt(chain, 0), superiorKeys);
  if (leaf.iss !== leaf.sub) throw new Error('leaf entity configuration is not self-issued');

  // 4. Count only trust marks whose JWT verifies against the anchor (the TA issues them here).
  const trustMarkTypes: string[] = [];
  for (const m of leaf.trust_marks ?? []) {
    if (!m.trust_mark || !m.trust_mark_type) continue;
    try {
      await jwtVerify(m.trust_mark, createLocalJWKSet(anchor.jwks));
      trustMarkTypes.push(m.trust_mark_type);
    } catch {
      // unverifiable mark — ignore (not counted as verified)
    }
  }

  return { entityId: String(leaf.sub), metadata: leaf.metadata ?? {}, trustMarkTypes };
}
