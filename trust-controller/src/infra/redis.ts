// Redis clients. Two logical databases on one instance:
//   db.store   -> system-of-record for Agent Identities (durable: appendonly + noeviction)
//   db.streams -> lifecycle event bus (Redis Streams, one stream per event type)
//
// This Redis is OURS, separate from Vouch's internal Redis. We touch Vouch only via its
// HTTP API, so we never share or poke its cache.

import { Redis } from 'ioredis';
import { config } from '../config.js';

// Attach an error listener so ioredis logs a concise one-liner instead of dumping an "Unhandled
// error event" stack trace on every reconnect attempt. Collapse bursts (e.g. the few seconds at
// startup before Redis is ready) to one line per 5s so the log stays readable.
function logConnectionErrors(client: Redis, name: string): void {
  let lastLoggedAt = 0;
  client.on('error', (err: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt > 5000) {
      console.warn(`[tc] redis (${name}) connection error: ${err.message}`);
      lastLoggedAt = now;
    }
  });
}

export const storeRedis = new Redis(config.redis.url, {
  db: config.redis.db.store,
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});
logConnectionErrors(storeRedis, 'store');

export const streamsRedis = new Redis(config.redis.url, {
  db: config.redis.db.streams,
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});
logConnectionErrors(streamsRedis, 'streams');

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
