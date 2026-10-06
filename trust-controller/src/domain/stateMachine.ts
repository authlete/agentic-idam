// Agent Identity lifecycle state machine (lifecycle orchestration drives the trust identity,
// guarded by governance and certification).
// Pure logic: validates a transition and returns the next state. Side-effects (Vouch calls,
// leaf publish, event emit) are run by the governance service, NOT here.
//
//        Manifest received
//              │
//              ▼
//     ┌──────────────────┐  gate (issue trust mark, stays pending)
//     │ pending_approval │◄────────┐
//     └──────────────────┘─────────┘
//              │ approve  (guard: agent-certified issuable; effects: marks + leaf + subordinate)
//              ▼
//        ┌──────────┐  suspend        ┌───────────┐
//        │ approved │────────────────►│ suspended │
//        │          │◄────────────────│           │
//        └──────────┘  reapprove      └───────────┘
//           │  revoke                      │ revoke
//           ▼                              ▼
//        ┌─────────┐   retire        ┌──────────┐
//        │ revoked │────────────────►│ retired  │
//        └─────────┘                 └──────────┘

import type { LifecycleState } from './types.js';

export type LifecycleTransition = 'approve' | 'suspend' | 'reapprove' | 'revoke' | 'retire';

interface TransitionRule {
  from: LifecycleState[];
  to: LifecycleState;
}

const TRANSITIONS: Record<LifecycleTransition, TransitionRule> = {
  approve: { from: ['pending_approval'], to: 'approved' },
  suspend: { from: ['approved'], to: 'suspended' },
  reapprove: { from: ['suspended'], to: 'approved' },
  revoke: { from: ['approved', 'suspended'], to: 'revoked' },
  retire: { from: ['revoked'], to: 'retired' },
};

/** Returns the next state or throws if the transition is not allowed from `current`. */
export function nextState(current: LifecycleState, transition: LifecycleTransition): LifecycleState {
  const rule = TRANSITIONS[transition];
  if (!rule.from.includes(current)) {
    throw new InvalidTransitionError(current, transition);
  }
  return rule.to;
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly current: LifecycleState,
    public readonly transition: LifecycleTransition,
  ) {
    super(`Cannot '${transition}' from state '${current}'`);
    this.name = 'InvalidTransitionError';
  }
}
