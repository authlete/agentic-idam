// The left-hand agent picker, shared by the Trust Controller and Federation Bridge views.
// It just renders a list and reports clicks; the parent owns the data and the selection.

import type { AgentIdentity } from '../lib/api';
import { shortId } from '../lib/format';
import { StateBadge } from './StateBadge';

export function AgentList({
  title,
  agents,
  onSelect,
  onRefresh,
  emptyText,
}: {
  title: string;
  agents: AgentIdentity[];
  onSelect: (entityId: string) => void;
  onRefresh: () => void;
  emptyText: string;
}) {
  return (
    <div className="col card" style={{ maxWidth: 420 }}>
      <h2>
        {title}
        <button className="secondary" style={{ float: 'right', padding: '3px 9px' }} onClick={onRefresh}>
          refresh
        </button>
      </h2>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.entityId} className="clickable" onClick={() => onSelect(agent.entityId)}>
              <td>
                {agent.displayName}
                <div className="hint mono">{shortId(agent.entityId)}</div>
              </td>
              <td>
                <StateBadge state={agent.lifecycleState} />
              </td>
            </tr>
          ))}
          {agents.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
