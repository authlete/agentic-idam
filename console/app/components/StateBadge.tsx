// The lifecycle-state pill (pending_approval, approved, suspended, revoked, retired).
// Colours come from the `.badge.<state>` rules in globals.css.

import type { LifecycleState } from '../lib/api';

export function StateBadge({ state, className = '' }: { state: LifecycleState; className?: string }) {
  return <span className={`badge ${state} ${className}`}>{state.replace('_', ' ')}</span>;
}
