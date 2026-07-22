// Leaf entity configuration builder. Each agent leaf is a SELF-SIGNED JWT (the RP describing
// itself) published at {entity_id}/.well-known/openid-federation. This is the subject side of
// the federation; the Trust Controller (authority) issues subordinate statements ABOUT it.
//
//   entity configuration JWT
//   ├── header:  { alg: RS256, kid, typ: entity-statement+jwt }
//   └── payload: { iss=sub=entity_id, iat, exp,
//                  jwks: { keys: [ public key ] },        <- self-validates its own signature
//                  authority_hints: [ trust anchor ],
//                  metadata: { openid_relying_party: {...} },
//                  trust_marks: [ { trust_mark_type, trust_mark(JWT) } ] }

import { generateKeyPair, exportJWK, importJWK, SignJWT, calculateJwkThumbprint, type JWK } from 'jose';

export interface TrustMarkEntry {
  trust_mark_type: string;
  trust_mark: string; // the signed mark JWT
}

export interface LeafRecord {
  entityId: string;
  privateJwk: JWK;
  publicJwk: JWK;
  metadata: Record<string, unknown>;
  jwt: string; // the signed entity configuration
}

const YEAR_SECONDS = 60 * 60 * 24 * 365;

async function generateAgentKey(): Promise<{ privateJwk: JWK; publicJwk: JWK }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(publicJwk);
  privateJwk.kid = kid;
  privateJwk.alg = 'RS256';
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  return { privateJwk, publicJwk };
}

// Inject the client's public keys into the openid_relying_party metadata (for private_key_jwt
// client auth), matching the entity's top-level jwks. Authlete uses these to verify client
// assertions. Returns a copy; leaves other metadata untouched and does nothing if there is no RP.
function withClientKeys(metadata: Record<string, unknown>, publicJwk: JWK): Record<string, unknown> {
  const rp = metadata.openid_relying_party;
  if (!rp || typeof rp !== 'object') return metadata;
  return {
    ...metadata,
    openid_relying_party: { ...(rp as Record<string, unknown>), jwks: { keys: [publicJwk] } },
  };
}

export async function buildLeaf(args: {
  entityId: string;
  authorityHints: string[];
  trustMarks: TrustMarkEntry[];
  metadata: Record<string, unknown>;
}): Promise<LeafRecord> {
  const { privateJwk, publicJwk } = await generateAgentKey();
  const key = await importJWK(privateJwk, 'RS256');
  const now = Math.floor(Date.now() / 1000);

  const metadata = withClientKeys(args.metadata, publicJwk);

  const jwt = await new SignJWT({
    jwks: { keys: [publicJwk] },
    authority_hints: args.authorityHints,
    metadata,
    trust_marks: args.trustMarks,
  })
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid as string, typ: 'entity-statement+jwt' })
    .setIssuer(args.entityId)
    .setSubject(args.entityId)
    .setIssuedAt(now)
    .setExpirationTime(now + YEAR_SECONDS)
    .sign(key);

  return { entityId: args.entityId, privateJwk, publicJwk, metadata: args.metadata, jwt };
}
