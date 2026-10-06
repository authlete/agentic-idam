// Data sources the bridge reads to build the Authlete client:
//   - Trust Controller (GET /identities/:entityId) for capability + marks + jwks (the governed state)
//   - the Trust Anchor /resolve for the VERIFIED trust chain + trust marks (the published federation view)
// the Trust Anchor is HTTPS with a self-signed dev cert, so resolve uses an undici dispatcher that
// skips verification (DEV ONLY).

import { Agent } from 'undici';
import { config } from './config.js';
import { verifyTrustChain } from './trustChain.js';

// The TA uses a self-signed dev cert, so the fetch skips TLS verification. Integrity does NOT
// rely on the transport: the trust chain is cryptographically verified against the pinned anchor
// (see trustChain.ts). In production the TA cert would also be trusted via a pinned CA.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export interface AgentIdentityView {
  entityId: string;
  agentRef: string;
  displayName: string;
  lifecycleState: string;
  environment: 'sandbox' | 'production';
  capability: { allowedActions: string[]; delegationPermitted: boolean };
  marks: { type: string; status: string }[];
  redirectUris?: string[];
  jwks?: { keys: Record<string, unknown>[] };
}

export async function fetchIdentity(entityId: string): Promise<AgentIdentityView> {
  const res = await fetch(`${config.tcBaseUrl}/identities/${encodeURIComponent(entityId)}`);
  if (!res.ok) throw new Error(`TC /identities -> ${res.status}`);
  return (await res.json()) as AgentIdentityView;
}

/** Report the DCR-assigned client_id back to the TC so the Agent Identity records the binding. */
export async function reportBinding(
  entityId: string,
  binding: { clientId?: string; registrationClientUri?: string },
): Promise<void> {
  try {
    await fetch(`${config.tcBaseUrl}/identities/${encodeURIComponent(entityId)}/binding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(binding),
    });
  } catch {
    // best-effort: don't fail the registration because the write-back hiccuped
  }
}

export interface ResolveView {
  verified: boolean;
  trustChainLength: number;
  verifiedMarkTypes: string[];
}

// TODO: delegate chain validation to the Trust Anchor /resolve response (verify its signature once)
// instead of re-verifying the whole chain in every bridge.

/** Fetch the trust chain from the Trust Anchor /resolve and INDEPENDENTLY verify it against the pinned trust
 *  anchor. Returns the verified view, or null if there is no chain or verification fails — the
 *  bridge treats a chain it cannot verify as ineligible (fail-closed). */
export async function resolve(entityId: string): Promise<ResolveView | null> {
  try {
    const anchor = encodeURIComponent(config.trustAnchorUrl);
    const url = `${config.trustAnchorUrl}/resolve?sub=${encodeURIComponent(entityId)}&trust_anchor=${anchor}`;
    const res = await fetch(url, { dispatcher: insecureAgent } as RequestInit);
    if (!res.ok) return null;
    const jwt = await res.text();
    const payloadB64 = jwt.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as { trust_chain?: string[] };
    const chain = payload.trust_chain;
    if (!chain?.length) return null;

    const verified = await verifyTrustChain(chain);
    if (verified.entityId !== entityId) return null; // chain resolves to a different subject
    return { verified: true, trustChainLength: chain.length, verifiedMarkTypes: verified.trustMarkTypes };
  } catch (e) {
    console.warn(`[bridge] trust chain verification failed for ${entityId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
