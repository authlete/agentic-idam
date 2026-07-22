// Bridge store (Redis DB 4). Records what the bridge registered per agent, keyed by entityId.
// Holds the RFC 7592 management credentials (registration_client_uri + registration_access_token)
// so the bridge can update/delete the client. The TC only records the client_id (attribution).
// Upsert = idempotent (create-once): a replayed event updates the same record.

import { Redis } from 'ioredis';
import { config } from './config.js';
import type { ClientMetadata, GovernanceDecision } from './dcr.js';
import type { ResolveView } from './sources.js';

const redis = new Redis(config.redis.url, { db: config.redis.db.store });

const KEY = (entityId: string) => `bridge:client:${entityId}`;
const IDX = 'bridge:clients';

export interface BridgeRecord {
  entityId: string;
  agentRef: string;
  lastEvent: string;
  decision: GovernanceDecision;
  metadata: ClientMetadata | null;
  /** DCR result. */
  clientId?: string;
  registrationClientUri?: string;
  registrationAccessToken?: string;
  status: 'registered' | 'updated' | 'deleted' | 'denied';
  resolve: ResolveView | null;
  updatedAt: string;
}

export async function upsert(record: BridgeRecord): Promise<void> {
  await redis.multi().set(KEY(record.entityId), JSON.stringify(record)).sadd(IDX, record.entityId).exec();
}

export async function get(entityId: string): Promise<BridgeRecord | null> {
  const raw = await redis.get(KEY(entityId));
  return raw ? (JSON.parse(raw) as BridgeRecord) : null;
}

export async function list(): Promise<BridgeRecord[]> {
  const ids = await redis.smembers(IDX);
  if (ids.length === 0) return [];
  const raws = await redis.mget(ids.map(KEY));
  return raws.filter((r: string | null): r is string => r !== null).map((r: string) => JSON.parse(r) as BridgeRecord);
}
