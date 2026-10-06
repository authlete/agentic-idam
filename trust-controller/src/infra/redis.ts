// Redis clients. Two logical databases on one instance:
//   db.store   -> system-of-record for Agent Identities (durable: appendonly + noeviction)
//   db.streams -> lifecycle event bus (Redis Streams, one stream per event type)
//
// This Redis is OURS, separate from Vouch's internal Redis. We touch Vouch only via its
// HTTP API, so we never share or poke its cache.

import { Redis } from 'ioredis';
import { config } from '../config.js';

export const storeRedis = new Redis(config.redis.url, {
  db: config.redis.db.store,
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

export const streamsRedis = new Redis(config.redis.url, {
  db: config.redis.db.streams,
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

export async function pingRedis(): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([storeRedis.ping(), streamsRedis.ping()]);
    return a === 'PONG' && b === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([storeRedis.quit(), streamsRedis.quit()]);
}
