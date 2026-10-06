// The governance-stage trust mark type catalog. These are bootstrapped ONCE into Vouch
// (POST /trustmarktypes) at setup. Each type = a named governance gate. Per-agent instances
// are issued as gates clear.
//
// Type URLs are minted under the Trust Controller's own base (it is the issuer authority).

import { config } from '../config.js';

const base = `${config.tcBaseUrl}/tm`;

export const TRUST_MARK_TYPES = {
  agentCertified: `${base}/agent-certified`,
  securityReviewed: `${base}/security-reviewed`,
  humanOwnerAttested: `${base}/human-owner-attested`,
  sandboxOnly: `${base}/sandbox-only`,
  productionApproved: `${base}/production-approved`,
  capabilityTier: `${base}/capability-tier`,
  delegationPermitted: `${base}/delegation-permitted`,
} as const;

export type TrustMarkTypeKey = keyof typeof TRUST_MARK_TYPES;

/** All type URLs, for the setup bootstrap. */
export const ALL_TRUST_MARK_TYPE_URLS: string[] = Object.values(TRUST_MARK_TYPES);
