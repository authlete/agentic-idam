// SHARED CONTRACT — lifecycle event bus (Redis Streams, one stream per event type).
//
// This is the contract the trust-controller (producer) and the fed-bridge (consumer)
// agree on up front. Extract this file to a shared workspace package so both import the
// same source (do NOT let two copies drift).
//
//   producer: trust-controller  -->  XADD evt:<type>
//   consumers: fed-bridge (published/suspended/revoked), console UI (live refresh)

export const STREAMS = {
  registered: 'evt:registered',
  certified: 'evt:certified',
  published: 'evt:published',
  suspended: 'evt:suspended',
  revoked: 'evt:revoked',
  retired: 'evt:retired',
} as const;

export type LifecycleEventType = keyof typeof STREAMS;

export interface LifecycleEvent {
  /** Federation entity identifier of the Agent Identity (the subject). */
  entityId: string;
  /** Reference back to the marketplace Agent object (FK, not ownership). */
  agentRef: string;
  /** Lifecycle state after the event. */
  state: string;
  /** ISO timestamp. */
  at: string;
  /** Optional extra context (e.g. mark type issued, downstream client id). */
  detail?: Record<string, unknown>;
}

/** Streams are XADD'd as flat field pairs; this is the wire shape. */
export function toStreamFields(evt: LifecycleEvent): string[] {
  return [
    'entityId', evt.entityId,
    'agentRef', evt.agentRef,
    'state', evt.state,
    'at', evt.at,
    'detail', JSON.stringify(evt.detail ?? {}),
  ];
}
