// SHARED CONTRACT (consumer side). Keep in sync with
// demo/trust-controller/src/shared/events.ts — same stream names + field shape. When this
// stabilises, extract to a shared workspace package so there is a single source.

export const STREAMS = {
  published: 'evt:published',
  suspended: 'evt:suspended',
  revoked: 'evt:revoked',
  retired: 'evt:retired',
} as const;

export type ConsumedStream = (typeof STREAMS)[keyof typeof STREAMS];

export interface LifecycleEvent {
  entityId: string;
  agentRef: string;
  state: string;
  at: string;
  detail: Record<string, unknown>;
}

/** Parse the flat [field, value, ...] array XADD'd by the producer into an event object. */
export function parseFields(fields: string[]): LifecycleEvent {
  const m = new Map<string, string>();
  for (let i = 0; i + 1 < fields.length; i += 2) m.set(fields[i] as string, fields[i + 1] as string);
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(m.get('detail') ?? '{}');
  } catch {
    detail = {};
  }
  return {
    entityId: m.get('entityId') ?? '',
    agentRef: m.get('agentRef') ?? '',
    state: m.get('state') ?? '',
    at: m.get('at') ?? '',
    detail,
  };
}
