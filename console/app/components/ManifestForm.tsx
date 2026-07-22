// The Agent Identity Manifest form (Marketplace page). Purely presentational and controlled:
// the parent owns the FormState and the submit/cancel actions; this just renders the fields.

import type { FormState } from '../lib/manifestForm';

export function ManifestForm({
  title,
  form,
  onChange,
  onSubmit,
  onCancel,
  result,
  error,
}: {
  title: string;
  form: FormState;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  result: string | null;
  error: string | null;
}) {
  const canSubmit = form.agentRef && form.displayName && form.ownerSubject;

  return (
    <div className="col card">
      <h2>{title}</h2>

      <label>Agent ref (marketplace id)</label>
      <input value={form.agentRef} onChange={(e) => onChange('agentRef', e.target.value)} placeholder="invoice-reconciler" />

      <label>Display name</label>
      <input value={form.displayName} onChange={(e) => onChange('displayName', e.target.value)} placeholder="Invoice Reconciler" />

      <label>Owner (accountable human)</label>
      <input value={form.ownerSubject} onChange={(e) => onChange('ownerSubject', e.target.value)} placeholder="jane.doe@example.com" />

      <label>Owning team</label>
      <input value={form.ownerTeam} onChange={(e) => onChange('ownerTeam', e.target.value)} placeholder="Payments Platform" />

      <label>Environment</label>
      <select value={form.environment} onChange={(e) => onChange('environment', e.target.value as FormState['environment'])}>
        <option value="sandbox">sandbox</option>
        <option value="production">production</option>
      </select>

      <label>Capabilities (comma-separated)</label>
      <input value={form.capabilities} onChange={(e) => onChange('capabilities', e.target.value)} placeholder="read:invoices, reconcile:payments" />

      <label>
        <input
          type="checkbox"
          style={{ width: 'auto', marginRight: 8 }}
          checked={form.delegation}
          onChange={(e) => onChange('delegation', e.target.checked)}
        />
        Request delegation (agent-to-agent token exchange)
      </label>

      <div style={{ marginTop: 16 }}>
        <button onClick={onSubmit} disabled={!canSubmit}>
          Emit Manifest &rarr; Trust Controller
        </button>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {result && <p style={{ color: 'var(--green)', marginTop: 12 }}>{result}</p>}
      {error && <p className="err" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
