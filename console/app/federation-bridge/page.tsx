'use client';

// Federation Bridge (integration layer). Per agent, shows the consumer-side work the
// bridge does: trust-chain resolution (via the Trust Anchor) and OAuth client registration (DCR).
// The Trust Controller only governs the identity; resolving and registering is the bridge's job.

import { useCallback, useState } from 'react';
import { api, type BridgeRecord, type FederationSummary } from '../lib/api';
import { useAgentList } from '../lib/useAgentList';
import { shortId } from '../lib/format';
import { AgentList } from '../components/AgentList';

export default function FederationBridge() {
  const [selected, setSelected] = useState<string | null>(null);
  const [federation, setFederation] = useState<FederationSummary | null>(null);
  const [bridge, setBridge] = useState<BridgeRecord | null>(null);

  const loadDetail = useCallback(async (entityId: string) => {
    setSelected(entityId);
    setFederation(await api.federation(entityId).catch(() => null));
    setBridge(await api.bridgeClient(entityId).catch(() => null));
  }, []);

  const { list, reload, select, error } = useAgentList(loadDetail);

  return (
    <>
      <h1>Federation Bridge</h1>
      <p className="hint">
        Resolves the trust chain and registers the OAuth client (DCR), driven by lifecycle events
        from the Trust Controller.
      </p>
      {error && <p className="err">{error}</p>}

      <div className="row">
        <AgentList
          title="Agents"
          agents={list}
          onSelect={select}
          onRefresh={reload}
          emptyText="No identities yet."
        />

        <div className="col">
          {!selected && <div className="card muted">Select an agent.</div>}
          {selected && (
            <>
              <FederationCard federation={federation} />
              <OAuthClientCard bridge={bridge} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function FederationCard({ federation }: { federation: FederationSummary | null }) {
  const verifiedMarks = (federation?.verifiedMarkTypes ?? []).map(shortId).join(', ') || '-';

  return (
    <div className="card">
      <h2>
        Federation view <span className="hint">(resolved via Trust Anchor)</span>
      </h2>
      {federation?.trustChainLength ? (
        <div className="kv">
          <div>Trust chain length</div>
          <div>{federation.trustChainLength}</div>
          <div>Verified marks</div>
          <div>{verifiedMarks}</div>
        </div>
      ) : (
        <span className="muted">not resolvable (not published, or withdrawn)</span>
      )}
    </div>
  );
}

function OAuthClientCard({ bridge }: { bridge: BridgeRecord | null }) {
  // The client metadata is only meaningful while the client is live; after delete it's stale.
  const showMetadata = bridge?.metadata && (bridge.status === 'registered' || bridge.status === 'updated');

  return (
    <div className="card">
      <h2>OAuth client (DCR)</h2>
      {!bridge && <span className="muted">no bridge record yet</span>}
      {bridge && (
        <>
          <p>
            Decision:{' '}
            {bridge.decision.allowed ? (
              <span style={{ color: 'var(--green)' }}>allowed ({bridge.decision.reason})</span>
            ) : (
              <span style={{ color: 'var(--red)' }}>denied ({bridge.decision.reason})</span>
            )}
            <span className="hint"> &middot; status: {bridge.status}</span>
            {bridge.clientId && <span className="hint"> &middot; client_id: {bridge.clientId}</span>}
          </p>
          {showMetadata && <pre>{JSON.stringify(bridge.metadata, null, 2)}</pre>}
        </>
      )}
    </div>
  );
}
