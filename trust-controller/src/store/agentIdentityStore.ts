// Agent Identity store — the system of record for the Agent Trust Identity, backed by Redis.
//
//   ai:<entityId>          -> JSON blob of the AgentIdentity aggregate
//   idx:all                -> SET of all entityIds
//   idx:state:<state>      -> SET of entityIds in that lifecycle state (cheap list/filter for UI)
//
// Durability is a server-side concern (appendonly yes, noeviction) so these records never
// evict or vanish on crash. See demo/docker-compose.yml.

import { storeRedis } from '../infra/redis.js';
import type { AgentIdentity, LifecycleState } from '../domain/types.js';

const KEY = (entityId: string) => `ai:${entityId}`;
const IDX_ALL = 'idx:all';
const IDX_STATE = (s: LifecycleState) => `idx:state:${s}`;

/** Heal records written before a schema change so old + new blobs both work.
 *  - `downstream.inmorSubordinateId` (removed) -> `federationSubordinateId`
 *  - missing `owner` (added later) -> an explicit "unassigned" placeholder (never undefined) */
function normalize(ai: AgentIdentity): AgentIdentity {
  const ds = ai.downstream as Record<string, unknown> | undefined;
  if (ds && ds.federationSubordinateId === undefined && ds.inmorSubordinateId !== undefined) {
    ds.federationSubordinateId = ds.inmorSubordinateId;
    delete ds.inmorSubordinateId;
  }
  if (!ai.owner) ai.owner = { subject: '' };
  return ai;
}

function parse(raw: string): AgentIdentity {
  return normalize(JSON.parse(raw) as AgentIdentity);
}

export async function get(entityId: string): Promise<AgentIdentity | null> {
  const raw = await storeRedis.get(KEY(entityId));
  return raw ? parse(raw) : null;
}

export async function exists(entityId: string): Promise<boolean> {
  return (await storeRedis.exists(KEY(entityId))) === 1;
}

/** Create a new identity. Fails if one already exists for this entityId. */
export async function create(ai: AgentIdentity): Promise<void> {
  const ok = await storeRedis.set(KEY(ai.entityId), JSON.stringify(ai), 'NX');
  if (ok !== 'OK') throw new Error(`Agent Identity already exists: ${ai.entityId}`);
  await storeRedis
    .multi()
    .sadd(IDX_ALL, ai.entityId)
    .sadd(IDX_STATE(ai.lifecycleState), ai.entityId)
    .exec();
}

/** Persist an updated identity, keeping the state index in sync. */
export async function save(ai: AgentIdentity, previousState?: LifecycleState): Promise<void> {
  ai.version += 1;
  ai.updatedAt = new Date().toISOString();
  const tx = storeRedis.multi().set(KEY(ai.entityId), JSON.stringify(ai)).sadd(IDX_ALL, ai.entityId);
  if (previousState && previousState !== ai.lifecycleState) {
    tx.srem(IDX_STATE(previousState), ai.entityId).sadd(IDX_STATE(ai.lifecycleState), ai.entityId);
  } else if (!previousState) {
    tx.sadd(IDX_STATE(ai.lifecycleState), ai.entityId);
  }
  await tx.exec();
}

export async function listAll(): Promise<AgentIdentity[]> {
  const ids = await storeRedis.smembers(IDX_ALL);
  return loadMany(ids);
}

export async function listByState(state: LifecycleState): Promise<AgentIdentity[]> {
  const ids = await storeRedis.smembers(IDX_STATE(state));
  return loadMany(ids);
}

async function loadMany(ids: string[]): Promise<AgentIdentity[]> {
  if (ids.length === 0) return [];
  const raws = await storeRedis.mget(ids.map(KEY));
  return raws
    .filter((r: string | null): r is string => r !== null)
    .map((r: string) => parse(r));
}
