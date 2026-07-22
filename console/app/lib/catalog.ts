// Seed catalog for the Agent Marketplace. In production the marketplace/catalogue owns these
// Agent objects; here they are hard-coded samples spanning the governance dimensions
// (sandbox vs production, delegation on/off) so the demo can pick instead of typing every field.

export interface CatalogAgent {
  agentRef: string;
  displayName: string;
  blurb: string;
  owner: { subject: string; team: string };
  environment: 'sandbox' | 'production';
  capabilities: string[];
  delegationRequested: boolean;
}

export const CATALOG: CatalogAgent[] = [
  {
    agentRef: 'invoice-reconciler',
    displayName: 'Invoice Reconciler',
    blurb: 'Reconciles supplier invoices against the ledger.',
    owner: { subject: 'jane.doe@example.com', team: 'Payments Platform' },
    environment: 'sandbox',
    capabilities: ['read:invoices', 'reconcile:payments'],
    delegationRequested: false,
  },
  {
    agentRef: 'incident-response-agent',
    displayName: 'Incident Response Agent',
    blurb: 'Triages production incidents and posts updates.',
    owner: { subject: 'sre-oncall@example.com', team: 'Platform Reliability' },
    environment: 'production',
    capabilities: ['read:logs', 'read:alerts', 'update:slack'],
    delegationRequested: true,
  },
  {
    agentRef: 'support-copilot',
    displayName: 'Customer Support Copilot',
    blurb: 'Assists contact-centre staff with customer queries.',
    owner: { subject: 'cc-lead@example.com', team: 'Customer Service' },
    environment: 'production',
    capabilities: ['read:customer-profile', 'read:transactions', 'create:case'],
    delegationRequested: false,
  },
  {
    agentRef: 'kyc-onboarding-agent',
    displayName: 'KYC Onboarding Agent',
    blurb: 'Verifies identity documents during onboarding.',
    owner: { subject: 'compliance-ops@example.com', team: 'Financial Crime / KYC' },
    environment: 'sandbox',
    capabilities: ['read:identity-docs', 'verify:identity', 'write:kyc-status'],
    delegationRequested: false,
  },
  {
    agentRef: 'trade-settlement-orchestrator',
    displayName: 'Trade Settlement Orchestrator',
    blurb: 'Orchestrates trade settlement across markets systems.',
    owner: { subject: 'markets-ops@example.com', team: 'Global Markets Operations' },
    environment: 'production',
    capabilities: ['read:trades', 'initiate:settlement', 'read:positions'],
    delegationRequested: true,
  },
];
