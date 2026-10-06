// Standard OAuth Dynamic Client Registration (RFC 7591) + management (RFC 7592).
// The bridge is the registrant: it builds client metadata from the agent's governance state and
// registers a PLAIN OAuth client at the AS's registration endpoint. The AS needs no federation
// support — just DCR. Build against Authlete's endpoint now, flip the URL to Ping at runtime.
//
//   published -> POST {registration_endpoint}            (create once, store the result)
//   reapprove -> PUT  {registration_client_uri}          (RFC 7592, update)
//   suspend/revoke/retire -> DELETE {registration_client_uri}  (RFC 7592, withdraw)
//
// Governance mapping (capability/marks -> RFC 7591 client metadata):
//   entity_id                     -> recorded as entity_id <-> client_id binding (client_id is AS-assigned)
//   agent public jwks             -> jwks (for private_key_jwt)
//   agent-certified present?      -> gate (no cert => refuse to register)
//   capability.allowedActions     -> scope
//   capability.delegationPermitted-> include token-exchange grant

import { Agent } from 'undici';
import { config } from './config.js';
import type { AgentIdentityView, ResolveView } from './sources.js';

// DCR endpoints (and the returned registration_client_uri) may be HTTPS with a self-signed dev
// cert (e.g. https://localhost via caddy). Accept it in dev. DEV ONLY.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
const fetchOpts = (init: RequestInit): RequestInit => ({ ...init, dispatcher: insecureAgent } as RequestInit);

export interface GovernanceDecision {
  allowed: boolean;
  reason: string;
}

/** RFC 7591 client metadata. */
export interface ClientMetadata {
  client_name: string;
  application_type: string;
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
  redirect_uris?: string[];
  scope?: string;
  jwks?: { keys: Record<string, unknown>[] };
}

/** RFC 7591 registration response (the fields we keep). */
export interface RegistrationResult {
  client_id: string;
  registration_client_uri?: string;
  registration_access_token?: string;
  raw: unknown;
}

// Eligibility is decided on the CRYPTOGRAPHICALLY VERIFIED trust chain (resolved), not on the
// marks the Trust Controller hands over — the bridge must not trust that channel. The TC's
// lifecycle state is kept only as a secondary guard.
export function decideGovernance(identity: AgentIdentityView, resolved: ResolveView | null): GovernanceDecision {
  if (!resolved?.verified) {
    return { allowed: false, reason: 'trust chain did not verify against the pinned trust anchor' };
  }
  const certified = resolved.verifiedMarkTypes.some((t) => t.endsWith('/agent-certified'));
  if (!certified) return { allowed: false, reason: 'no verified agent-certified trust mark in the chain' };
  if (identity.lifecycleState !== 'approved') {
    return { allowed: false, reason: `lifecycle state is ${identity.lifecycleState}, not approved` };
  }
  return { allowed: true, reason: 'verified chain + agent-certified + approved' };
}

export function buildClientMetadata(identity: AgentIdentityView): ClientMetadata {
  const grantTypes = ['authorization_code', 'refresh_token'];
  if (identity.capability.delegationPermitted) grantTypes.push('urn:ietf:params:oauth:grant-type:token-exchange');
  const scope = ['openid', 'profile', 'email', ...identity.capability.allowedActions].join(' ');
  return {
    client_name: identity.displayName,
    application_type: 'web',
    token_endpoint_auth_method: config.dcr.tokenAuthMethod, // private_key_jwt (spiffe_jwt later)
    grant_types: grantTypes,
    response_types: ['code'],
    ...(identity.redirectUris ? { redirect_uris: identity.redirectUris } : {}),
    scope,
    ...(identity.jwks ? { jwks: identity.jwks } : {}),
  };
}

function authHeader(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** RFC 7591: POST the metadata to the registration endpoint. */
export async function registerClient(metadata: ClientMetadata): Promise<RegistrationResult> {
  const res = await fetch(config.dcr.registrationEndpoint, fetchOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(config.dcr.initialAccessToken) },
    body: JSON.stringify(metadata),
  }));
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`DCR register -> ${res.status}: ${JSON.stringify(body)}`);
  return {
    client_id: String(body.client_id),
    ...(body.registration_client_uri ? { registration_client_uri: String(body.registration_client_uri) } : {}),
    ...(body.registration_access_token ? { registration_access_token: String(body.registration_access_token) } : {}),
    raw: body,
  };
}

/** RFC 7592: PUT the full metadata (incl client_id) to the registration_client_uri. */
export async function updateClient(
  registrationClientUri: string,
  registrationAccessToken: string | undefined,
  clientId: string,
  metadata: ClientMetadata,
): Promise<void> {
  const res = await fetch(registrationClientUri, fetchOpts({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader(registrationAccessToken) },
    body: JSON.stringify({ client_id: clientId, ...metadata }),
  }));
  if (!res.ok) throw new Error(`DCR update -> ${res.status}: ${await res.text()}`);
}

/** RFC 7592: DELETE the registration (withdraw). */
export async function deleteClient(
  registrationClientUri: string,
  registrationAccessToken: string | undefined,
): Promise<void> {
  const res = await fetch(registrationClientUri, fetchOpts({ method: 'DELETE', headers: authHeader(registrationAccessToken) }));
  if (!res.ok && res.status !== 404) throw new Error(`DCR delete -> ${res.status}: ${await res.text()}`);
}
