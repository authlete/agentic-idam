// Form state + mapping helpers for the Agent Identity Manifest form (Marketplace page).
// Pure functions, no React. The form is a flat all-strings/booleans shape backing the inputs;
// Manifest (lib/api) is the API payload it maps to on submit.

import type { Manifest } from './api';
import type { CatalogAgent } from './catalog';
import { parseCsv, slugify } from './format';

export interface FormState {
  agentRef: string;
  displayName: string;
  ownerSubject: string;
  ownerTeam: string;
  environment: 'sandbox' | 'production';
  capabilities: string; // one comma-separated field in the form; a list in the Manifest
  delegation: boolean;
}

export const BLANK_FORM: FormState = {
  agentRef: '',
  displayName: '',
  ownerSubject: '',
  ownerTeam: '',
  environment: 'sandbox',
  capabilities: '',
  delegation: false,
};

/** Pre-fill the form from a catalogued agent. */
export function formFromCatalog(agent: CatalogAgent): FormState {
  return {
    agentRef: agent.agentRef,
    displayName: agent.displayName,
    ownerSubject: agent.owner.subject,
    ownerTeam: agent.owner.team,
    environment: agent.environment,
    capabilities: agent.capabilities.join(', '),
    delegation: agent.delegationRequested,
  };
}

/** Build the API payload from the form, omitting optional fields that are empty. */
export function buildManifest(form: FormState): Manifest {
  return {
    agentRef: form.agentRef,
    displayName: form.displayName,
    owner: { subject: form.ownerSubject, ...(form.ownerTeam ? { team: form.ownerTeam } : {}) },
    environment: form.environment,
    capabilities: parseCsv(form.capabilities),
    delegationRequested: form.delegation,
  };
}

/** Merge an A2A Agent Card (name -> display name + agent ref, skills -> capabilities) into the
 *  form, leaving all other fields untouched. Throws if the text is not valid JSON. */
export function mergeAgentCard(form: FormState, cardJson: string): FormState {
  const card = JSON.parse(cardJson) as { name?: string; skills?: { id?: string }[] };
  const next = { ...form };
  if (card.name) {
    next.displayName = card.name;
    next.agentRef = slugify(card.name);
  }
  if (card.skills) {
    next.capabilities = card.skills.map((skill) => skill.id).filter(Boolean).join(', ');
  }
  return next;
}
