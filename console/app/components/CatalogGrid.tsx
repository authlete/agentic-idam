// The agent picker on the Marketplace page: one card per catalogued agent, plus a "custom" card.
// Clicking a card selects it (or deselects if it's already selected — handled by the parent).

import { CATALOG, type CatalogAgent } from '../lib/catalog';

export function CatalogGrid({
  selected,
  onPick,
  onPickCustom,
}: {
  selected: string | null;
  onPick: (agent: CatalogAgent) => void;
  onPickCustom: () => void;
}) {
  return (
    <div className="catalog">
      {CATALOG.map((agent) => (
        <div
          key={agent.agentRef}
          className={`agent-card ${selected === agent.agentRef ? 'selected' : ''}`}
          onClick={() => onPick(agent)}
        >
          <strong>{agent.displayName}</strong>
          <div className="agent-card-badges">
            <span className={`badge ${agent.environment}`}>{agent.environment}</span>
            {agent.delegationRequested && <span className="badge delegation">delegation</span>}
          </div>
          <p className="hint" style={{ margin: '0 0 10px' }}>
            {agent.blurb}
          </p>
          <div>
            {agent.capabilities.slice(0, 3).map((capability) => (
              <span className="mark" key={capability}>
                {capability}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className={`agent-card custom ${selected === 'custom' ? 'selected' : ''}`} onClick={onPickCustom}>
        <div>
          <div style={{ fontSize: 26, lineHeight: 1 }}>+</div>
          <strong>Custom agent</strong>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Start from a blank manifest
          </p>
        </div>
      </div>
    </div>
  );
}
