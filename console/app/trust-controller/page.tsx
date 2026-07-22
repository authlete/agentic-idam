'use client';

// Trust Controller (control plane, Identity Platform Team) - the governance console. Lists Agent
// Identities, runs lifecycle transitions, and shows the Agent Identity itself: trust marks,
// capability, and downstream bindings. Resolution + client registration live in the Federation
// Bridge view, not here (one console per layer).

import { useCallback, useState } from 'react';
import { api, TRANSITIONS, type AgentIdentity } from '../lib/api';
import { useAgentList } from '../lib/useAgentList';
import { shortId } from '../lib/format';
import { AgentList } from '../components/AgentList';
import { StateBadge } from '../components/StateBadge';

export default function TrustController() {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentIdentity | null>(null);
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback(async (entityId: string) => {
    setSelected(entityId);
    setDetail(await api.getIdentity(entityId));
  }, []);

  const { list, reload, select, error, setError } = useAgentList(loadDetail);

  async function doTransition(action: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.transition(selected, action);
      // Give the bridge a beat to consume the event, then refresh everything.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await reload();
      await loadDetail(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Trust Controller</h1>
      <p className="hint">Control plane &middot; Identity Platform Team &mdash; governs the Agent Identity lifecycle.</p>
      {error && <p className="err">{error}</p>}

      <div className="row">
        <AgentList
          title="Agent Identities"
          agents={list}
          onSelect={select}
          onRefresh={reload}
          emptyText="No identities. Onboard one in Agent Marketplace."
        />

        <div className="col">
          {!detail && <div className="card muted">Select an agent identity.</div>}
          {detail && <AgentDetail detail={detail} busy={busy} onTransition={doTransition} />}
        </div>
      </div>
    </>
  );
}

function AgentDetail({
  detail,
  busy,
  onTransition,
}: {
  detail: AgentIdentity;
  busy: boolean;
  onTransition: (action: string) => void;
}) {
  const owner = detail.owner?.subject
    ? `${detail.owner.subject}${detail.owner.team ? ` (${detail.owner.team})` : ''}`
    : null;
  const actions = TRANSITIONS[detail.lifecycleState];

  return (
    <>
      <div className="card">
        <h2>
          {detail.displayName} <StateBadge state={detail.lifecycleState} className="float-right" />
        </h2>
        <div className="kv">
          <div>Entity ID</div>
          <div className="mono">{detail.entityId}</div>
          <div>Agent ref</div>
          <div>{detail.agentRef}</div>
          <div>Owner</div>
          <div>{owner ?? <span className="muted">unassigned</span>}</div>
          <div>Environment</div>
          <div>{detail.environment}</div>
        </div>

        <h2 style={{ marginTop: 18, fontSize: '0.95rem' }}>
          Representations
        </h2>
        <div className="kv">
          <div>Federation</div>
          <div>{detail.lifecycleState === 'approved' ? 'published' : <span className="muted">not published</span>}</div>
          <div>Client (AS)</div>
          <div className="mono">{detail.downstream.clientId || <span className="muted">not registered</span>}</div>
          <div>Workload (SPIFFE)</div>
          <div className="mono">{detail.downstream.spiffeId || <span className="muted">unbound</span>}</div>
        </div>

        <div style={{ marginTop: 16 }}>
          {actions.map((action) => (
            <button
              key={action}
              className={action === 'revoke' || action === 'retire' ? 'danger' : ''}
              disabled={busy}
              onClick={() => onTransition(action)}
            >
              {busy ? '...' : action}
            </button>
          ))}
          {actions.length === 0 && <span className="muted">terminal state</span>}
        </div>
      </div>

      <div className="card">
        <h2>Capability envelope</h2>
        <div>
          {detail.capability.allowedActions.map((action) => (
            <span className="mark" key={action}>
              {action}
            </span>
          ))}
        </div>
        <p className="hint">
          Delegation (token exchange): {detail.capability.delegationPermitted ? 'permitted' : 'not permitted'}
        </p>
      </div>

      <div className="card">
        <h2>Trust marks (certification)</h2>
        {detail.marks.length === 0 && <span className="muted">none issued yet</span>}
        {detail.marks.map((mark, i) => (
          <span key={i} className={`mark ${mark.status}`}>
            {shortId(mark.type)}
          </span>
        ))}
      </div>
    </>
  );
}
