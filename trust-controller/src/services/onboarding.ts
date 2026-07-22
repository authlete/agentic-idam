// Onboarding — the Manifest handoff seam. The marketplace emits an Agent Identity
// Manifest; the Trust Controller DERIVES an Agent Identity from it (one-way: Agent -> Identity)
// and stores it in `pending_approval`. The Agent object itself stays owned by the marketplace;
// we only keep a reference (`agentRef`).

import { config } from '../config.js';
import { emit } from '../infra/eventBus.js';
import * as store from '../store/agentIdentityStore.js';
import type { AgentIdentity, AgentIdentityManifest } from '../domain/types.js';

/** Mint a federation entity_id from the agent reference, under the agent base URL. */
function mintEntityId(agentRef: string): string {
  const slug = agentRef
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${config.federation.agentBaseUrl}/${slug}`;
}

export async function onboardFromManifest(manifest: AgentIdentityManifest): Promise<AgentIdentity> {
  const entityId = mintEntityId(manifest.agentRef);
  const now = new Date().toISOString();

  const ai: AgentIdentity = {
    entityId,
    agentRef: manifest.agentRef,
    displayName: manifest.displayName,
    owner: manifest.owner,
    lifecycleState: 'pending_approval',
    marks: [],
    capability: {
      version: 1,
      allowedActions: manifest.capabilities ?? [],
      delegationPermitted: manifest.delegationRequested ?? false,
    },
    ...(manifest.jwks ? { jwks: manifest.jwks } : {}),
    environment: manifest.environment ?? 'sandbox',
    ...(manifest.redirectUris ? { redirectUris: manifest.redirectUris } : {}),
    // downstream bindings start empty; each bridge reconciles its projection back (client_id
    // from the Federation Bridge, spiffe_id from the Workload Bridge, …).
    downstream: {},
    version: 0,
    audit: [{ at: now, action: 'onboarded', detail: { agentRef: manifest.agentRef } }],
    createdAt: now,
    updatedAt: now,
  };

  await store.create(ai);
  await emit('registered', { entityId, agentRef: ai.agentRef, state: ai.lifecycleState, at: now });
  return ai;
}
