'use client';

// Agent Marketplace (application layer, Agent Platform Team). Pick a catalogued agent (pre-fills
// the manifest) or create a custom one — optionally from an A2A agent.json card — then emit the
// Agent Identity Manifest to the Trust Controller. This is a MOCK of the real marketplace: it owns
// the Agent object and only hands off the manifest.
//
// The form pieces live next door: lib/manifestForm.ts (state shape + mapping helpers) and
// components/ManifestForm.tsx (the fields). This page owns the selection + submit flow.

import { useState } from 'react';
import { api } from '../lib/api';
import { type CatalogAgent } from '../lib/catalog';
import { BLANK_FORM, buildManifest, formFromCatalog, mergeAgentCard, type FormState } from '../lib/manifestForm';
import { CatalogGrid } from '../components/CatalogGrid';
import { ManifestForm } from '../components/ManifestForm';

export default function Marketplace() {
  // selected = a catalog agentRef, 'custom', or null (nothing picked yet)
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function select(agentRef: string | null, prefill: FormState) {
    setSelected(agentRef);
    setResult(null);
    setError(null);
    setForm(prefill);
  }

  function deselect() {
    select(null, BLANK_FORM);
  }

  function pickCatalogAgent(agent: CatalogAgent) {
    if (selected === agent.agentRef) return deselect(); // click again to deselect
    select(agent.agentRef, formFromCatalog(agent));
  }

  function pickCustom() {
    if (selected === 'custom') return deselect(); // click again to deselect
    select('custom', BLANK_FORM);
  }

  function applyAgentCard(text: string) {
    // Parse eagerly here, not inside the setForm updater: React runs the updater during render,
    // so a JSON.parse throw there would escape this try/catch (and can wedge the render).
    let next: FormState;
    try {
      next = mergeAgentCard(form, text);
    } catch {
      setError('Not valid JSON');
      return;
    }
    setError(null);
    setForm(next);
  }

  async function submit() {
    setError(null);
    setResult(null);
    try {
      const identity = await api.onboard(buildManifest(form));
      setResult(`Onboarded ${identity.entityId} (state: ${identity.lifecycleState}). Govern it in Trust Controller.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <h1>Agent Marketplace <span className="badge simulated" style={{ verticalAlign: 'middle', marginLeft: 6 }}>simulated</span></h1>
      <p className="hint">
        Agent Platform Team &mdash; owns the Agent, emits the identity manifest.
      </p>

      <h2>Choose an agent</h2>
      <CatalogGrid selected={selected} onPick={pickCatalogAgent} onPickCustom={pickCustom} />

      {!selected && (
        <div className="card muted">
          Select an agent above, or choose <strong>Custom agent</strong> to start from scratch.
        </div>
      )}

      {selected && (
        <div className="row">
          <ManifestForm
            title={selected === 'custom' ? 'New agent' : 'Review & emit'}
            form={form}
            onChange={updateField}
            onSubmit={submit}
            onCancel={deselect}
            result={result}
            error={error}
          />

          {selected === 'custom' && (
            <div className="col card">
              <h2>Or import agent.json (A2A)</h2>
              <p className="hint">Paste an A2A Agent Card; name &rarr; display name, skills &rarr; capabilities.</p>
              <textarea
                placeholder='{ "name": "Invoice Reconciler", "skills": [{ "id": "read:invoices" }] }'
                onChange={(e) => applyAgentCard(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
