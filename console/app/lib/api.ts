// Typed client for the Trust Controller (:8091) and Fed Bridge (:8093). CORS is enabled on both.

const TC = process.env.NEXT_PUBLIC_TC_URL ?? 'http://localhost:8091';
const BRIDGE = process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:8093';

export type LifecycleState =
  | 'pending_approval' | 'approved' | 'suspended' | 'revoked' | 'retired';

export interface IssuedMark { type: string; status: 'active' | 'revoked'; issuedAt: string }
export interface Owner { subject: string; team?: string }
export interface AgentIdentity {
  entityId: string;
  agentRef: string;
  displayName: string;
  owner: Owner;
  lifecycleState: LifecycleState;
  marks: IssuedMark[];
  capability: { version: number; allowedActions: string[]; delegationPermitted: boolean };
  environment: 'sandbox' | 'production';
  downstream: {
    federationSubordinateId?: number;
    clientId?: string;
    registrationClientUri?: string;
    spiffeId?: string;
  };
  version: number;
  updatedAt: string;
}

export interface Manifest {
  agentRef: string;
  displayName: string;
  owner: Owner;
  environment?: 'sandbox' | 'production';
  capabilities?: string[];
  delegationRequested?: boolean;
}

export interface FederationSummary {
  trustChainLength?: number;
  verifiedMarkTypes?: string[];
  resolvable?: boolean;
}

export interface BridgeRecord {
  entityId: string;
  agentRef: string;
  lastEvent: string;
  decision: { allowed: boolean; reason: string };
  /** The RFC 7591 client metadata the bridge built and registered. */
  metadata: Record<string, unknown> | null;
  /** AS-assigned client_id (present once registered). */
  clientId?: string;
  registrationClientUri?: string;
  status: 'registered' | 'updated' | 'deleted' | 'denied';
  resolve: { trustChainLength: number; verifiedMarkTypes: string[] } | null;
  updatedAt: string;
}

// Fetch, throw on non-2xx (with the body for context), and parse the JSON response as T.
async function fetchJson<T>(request: Promise<Response>): Promise<T> {
  const res = await request;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Entity ids are URLs, so they must be encoded before going into a path segment.
const encodeId = (id: string) => encodeURIComponent(id);

export const api = {
  listIdentities: (state?: LifecycleState) =>
    fetchJson<AgentIdentity[]>(fetch(`${TC}/identities${state ? `?state=${state}` : ''}`, { cache: 'no-store' })),
  getIdentity: (entityId: string) =>
    fetchJson<AgentIdentity>(fetch(`${TC}/identities/${encodeId(entityId)}`, { cache: 'no-store' })),
  onboard: (manifest: Manifest) =>
    fetchJson<AgentIdentity>(fetch(`${TC}/identities`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(manifest),
    })),
  transition: (entityId: string, action: string) =>
    fetchJson<AgentIdentity>(fetch(`${TC}/identities/${encodeId(entityId)}/transition/${action}`, { method: 'POST' })),
  federation: (entityId: string) =>
    fetchJson<FederationSummary>(fetch(`${TC}/identities/${encodeId(entityId)}/federation`, { cache: 'no-store' })),
  bridgeClient: (entityId: string) =>
    fetch(`${BRIDGE}/clients/${encodeId(entityId)}`, { cache: 'no-store' }).then((r) =>
      r.ok ? (r.json() as Promise<BridgeRecord>) : null,
    ),
  health: async () => {
    const ping = async (url: string) => {
      try {
        return (await fetch(url, { cache: 'no-store' })).ok;
      } catch {
        return false;
      }
    };
    return { tc: await ping(`${TC}/`), bridge: await ping(`${BRIDGE}/`) };
  },
};

/** Which lifecycle transitions are offered from a given state (mirror of the server state machine). */
export const TRANSITIONS: Record<LifecycleState, string[]> = {
  pending_approval: ['approve'],
  approved: ['suspend', 'revoke'],
  suspended: ['reapprove', 'revoke'],
  revoked: ['retire'],
  retired: [],
};
