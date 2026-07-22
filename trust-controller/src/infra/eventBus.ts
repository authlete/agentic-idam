// Lifecycle event producer. Emits to Redis Streams (one stream per event type).
// At-least-once delivery; consumers (fed-bridge) must be idempotent (issue 4).

import { streamsRedis } from './redis.js';
import { STREAMS, toStreamFields, type LifecycleEvent, type LifecycleEventType } from '../shared/events.js';

export async function emit(type: LifecycleEventType, evt: LifecycleEvent): Promise<string> {
  const stream = STREAMS[type];
  // XADD <stream> * field value field value ...
  const id = await streamsRedis.xadd(stream, '*', ...toStreamFields(evt));
  return id ?? '';
}
