'use client';

import { useEffect, useState } from 'react';
import { api, type LifecycleState } from './lib/api';
import { StateBadge } from './components/StateBadge';

const LIFECYCLE_STATES: LifecycleState[] = ['pending_approval', 'approved', 'suspended', 'revoked', 'retired'];

export default function Overview() {
  const [health, setHealth] = useState<{ tc: boolean; bridge: boolean } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    api.health().then(setHealth);
    api.listIdentities().then((list) => {
      const byState: Record<string, number> = {};
      for (const agent of list) byState[agent.lifecycleState] = (byState[agent.lifecycleState] ?? 0) + 1;
      setCounts(byState);
    }).catch(() => {});
  }, []);

  return (
    <>
      <h1>Overview</h1>
      <div className="card">
        <h2>Services</h2>
        <p>
          <span className={`dot ${health?.tc ? 'up' : 'down'}`} /> Trust Controller (:8091)
          &nbsp;&nbsp;
          <span className={`dot ${health?.bridge ? 'up' : 'down'}`} /> Federation Bridge (:8093)
        </p>
      </div>

      <div className="card">
        <h2>Agent Identities by state</h2>
        <div className="row">
          {LIFECYCLE_STATES.map((state) => (
            <div className="col" key={state} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{counts[state] ?? 0}</div>
              <StateBadge state={state} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Flow</h2>
        <ol className="flow">
          <li><a href="/marketplace">Agent Marketplace</a> &mdash; emits the identity manifest</li>
          <li><a href="/trust-controller">Trust Controller</a> &mdash; governs the Agent Identity; on approve, publishes it (trust marks + leaf + subordinate)</li>
          <li><a href="/federation-bridge">Federation Bridge</a> &mdash; resolves the trust chain, registers the OAuth client (DCR)</li>
          <li><a href="http://localhost:3000" target="_blank" rel="noopener noreferrer">Authorization Server</a> &mdash; issues tokens</li>
        </ol>
      </div>
    </>
  );
}
