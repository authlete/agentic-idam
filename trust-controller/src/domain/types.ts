// Domain model — the Agent Trust Identity aggregate and its neighbours. This is the
// system-of-record object; Inmor holds only its federation PROJECTION (subordinate
// statement + trust marks).

export type LifecycleState =
  | 'pending_approval'
  | 'approved'
  | 'suspended'
  | 'revoked'
  | 'retired';

/** Human accountability for the agent (governance RACI). This is how agents link to their
 *  human owners — assigned by the platform team at onboarding, NOT self-declared by the
 *  agent card. */
export interface Owner {
  /** Accountable human (email or staff id). */
  subject: string;
  /** Owning team / cost centre. */
  team?: string;
}

/** A trust mark issued to this identity (mirrors what Inmor stores; id lets us revoke). */
export interface IssuedMark {
  /** Inmor trust mark record id (needed to PUT active:false on revoke). */
  inmorId: number;
  /** Trust mark type URL (the governance gate). */
  type: string;
  /** The signed trust mark JWT (embedded in the leaf's trust_marks so /resolve can verify it). */
  jwt: string;
  /** active | revoked (local view; Inmor is authoritative via /trust_mark_status). */
  status: 'active' | 'revoked';
  issuedAt: string;
}

/** Capability envelope — versioned, independent of OAuth scopes.
 *  Associated to the identity, NOT contained: a change here must not touch the identity. */
export interface CapabilityEnvelope {
  version: number;
  /** Coarse capabilities the agent is permitted; fed-bridge maps these to Authlete scopes. */
  allowedActions: string[];
  /** Whether agent-to-agent delegation (token-exchange) is permitted. */
  delegationPermitted: boolean;
}

export interface AuditEntry {
  at: string;
  action: string;
  detail?: Record<string, unknown>;
}

/** Public JWK Set (per-agent leaf key). Private key lives with the entity-publisher. */
export interface JwkSet {
  keys: Record<string, unknown>[];
}

export interface AgentIdentity {
  /** Federation entity identifier (a URL). Primary key. */
  entityId: string;
  /** Reference to the marketplace Agent object (FK, not ownership — a boundary the Trust
   *  Controller must not cross by becoming system of record for the Agent). */
  agentRef: string;
  displayName: string;
  /** Accountable human owner (governance). */
  owner: Owner;
  lifecycleState: LifecycleState;
  /** Certification evidence — the trust marks issued as governance gates cleared. */
  marks: IssuedMark[];
  /** Capability envelope (associated). */
  capability: CapabilityEnvelope;
  /** Public keys published in the leaf entity config; reused in POST /subordinates. */
  jwks?: JwkSet;
  /** Environment class (drives sandbox-only vs production-approved marks). */
  environment: 'sandbox' | 'production';
  /** OAuth redirect URIs published in the RP metadata (for automatic registration). */
  redirectUris?: string[];
  /** Downstream representation bindings — the four-layer chain below the Agent Identity:
   *    federationSubordinateId : the federation subordinate (set by the TC on publish)
   *    clientId / registrationClientUri : Client Representation in the AS (set by fed-bridge, DCR)
   *    spiffeId : Workload Representation (SPIFFE/SPIRE) this identity is bound to
   *  entity_id (this object) ↔ client_id ↔ spiffe_id is the full attribution chain. */
  downstream: {
    federationSubordinateId?: number;
    clientId?: string;
    registrationClientUri?: string;
    spiffeId?: string;
  };
  version: number;
  audit: AuditEntry[];
  createdAt: string;
  updatedAt: string;
}

/** The Agent Identity Manifest — the handoff artifact from the marketplace (the seam).
 *  Normalization target that ingests A2A agent.json / manual entry. */
export interface AgentIdentityManifest {
  agentRef: string;
  displayName: string;
  /** Accountable human owner, assigned by the platform team at handoff. */
  owner: Owner;
  environment?: 'sandbox' | 'production';
  /** Requested capabilities (become the initial capability envelope). */
  capabilities?: string[];
  delegationRequested?: boolean;
  /** OAuth redirect URIs for the agent's client (published in RP metadata). */
  redirectUris?: string[];
  /** Optional pre-supplied public keys (else entity-publisher generates them at publish). */
  jwks?: JwkSet;
}
