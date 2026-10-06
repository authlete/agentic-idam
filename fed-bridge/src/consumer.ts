// Lifecycle event consumer. Reads the Trust Controller's Redis Streams with a consumer group
// (at-least-once). The event is only a trigger (entity_id); the bridge independently resolves and
// verifies the trust chain against the pinned trust anchor before it provisions anything (zero
// trust — see trustChain.ts). For each event: fetch the identity, resolve+verify, decide
// governance on the VERIFIED chain, and drive standard DCR:
//   published  -> register (create once) or update (if already registered)  [RFC 7591 / 7592]
//   suspended  -> delete the client                                          [RFC 7592]
//   revoked    -> delete the client
//   retired    -> delete the client
// Idempotent: create-once keyed by the stored client_id (never re-POST); XACK only after success.

import { Redis } from 'ioredis';
import { config } from './config.js';
import { STREAMS, parseFields, type ConsumedStream } from './events.js';
import { fetchIdentity, resolve, reportBinding } from './sources.js';
import {
  buildClientMetadata, decideGovernance, registerClient, updateClient, deleteClient,
} from './dcr.js';
import * as store from './store.js';
import type { BridgeRecord } from './store.js';

const GROUP = 'fed-bridge';
const CONSUMER = 'fed-bridge-1';
const STREAM_LIST: ConsumedStream[] = [STREAMS.published, STREAMS.suspended, STREAMS.revoked, STREAMS.retired];

const reader = new Redis(config.redis.url, { db: config.redis.db.streams });

// Log a concise one-liner on connection errors (collapsing reconnect bursts) instead of letting
// ioredis dump an "Unhandled error event" stack trace on every retry.
let lastErrorLoggedAt = 0;
reader.on('error', (err: Error) => {
  const now = Date.now();
  if (now - lastErrorLoggedAt > 5000) {
    console.warn(`[bridge] redis (streams) connection error: ${err.message}`);
    lastErrorLoggedAt = now;
  }
});

async function ensureGroups(): Promise<void> {
  for (const stream of STREAM_LIST) {
    try {
      await reader.xgroup('CREATE', stream, GROUP, '0', 'MKSTREAM');
    } catch (e) {
      if (!(e instanceof Error && e.message.includes('BUSYGROUP'))) throw e;
    }
  }
}

async function onPublished(entityId: string, agentRef: string): Promise<void> {
  const identity = await fetchIdentity(entityId);
  const resolveView = await resolve(entityId);
  const decision = decideGovernance(identity, resolveView);

  if (!decision.allowed) {
    await store.upsert({
      entityId, agentRef, lastEvent: STREAMS.published, decision, metadata: null,
      status: 'denied', resolve: resolveView, updatedAt: new Date().toISOString(),
    });
    console.log(`[bridge] published ${entityId} -> DENIED: ${decision.reason}`);
    return;
  }

  const metadata = buildClientMetadata(identity);
  const existing = await store.get(entityId);
  const rec: BridgeRecord = {
    entityId, agentRef, lastEvent: STREAMS.published, decision, metadata,
    status: 'registered', resolve: resolveView, updatedAt: new Date().toISOString(),
  };

  if (existing?.clientId && existing.registrationClientUri) {
    // Already registered -> RFC 7592 update (create-once).
    await updateClient(existing.registrationClientUri, existing.registrationAccessToken, existing.clientId, metadata);
    rec.clientId = existing.clientId;
    rec.registrationClientUri = existing.registrationClientUri;
    if (existing.registrationAccessToken) rec.registrationAccessToken = existing.registrationAccessToken;
    rec.status = 'updated';
    console.log(`[bridge] published ${entityId} -> UPDATED client ${existing.clientId}`);
  } else {
    const result = await registerClient(metadata);
    rec.clientId = result.client_id;
    if (result.registration_client_uri) rec.registrationClientUri = result.registration_client_uri;
    if (result.registration_access_token) rec.registrationAccessToken = result.registration_access_token;
    const binding = { clientId: result.client_id, ...(result.registration_client_uri ? { registrationClientUri: result.registration_client_uri } : {}) };
    await reportBinding(entityId, binding);
    console.log(`[bridge] published ${entityId} -> REGISTERED client ${result.client_id}`);
  }
  await store.upsert(rec);
}

async function onWithdraw(stream: ConsumedStream, entityId: string, agentRef: string): Promise<void> {
  const existing = await store.get(entityId);
  if (existing?.clientId && existing.registrationClientUri) {
    await deleteClient(existing.registrationClientUri, existing.registrationAccessToken);
    await reportBinding(entityId, { clientId: '', registrationClientUri: '' });
    console.log(`[bridge] ${stream} ${entityId} -> DELETED client ${existing.clientId}`);
  } else {
    console.log(`[bridge] ${stream} ${entityId} -> no registered client to delete`);
  }
  await store.upsert({
    entityId, agentRef, lastEvent: stream,
    decision: { allowed: false, reason: stream }, metadata: existing?.metadata ?? null,
    status: 'deleted', resolve: null, updatedAt: new Date().toISOString(),
  });
}

async function handle(stream: ConsumedStream, fields: string[]): Promise<void> {
  const evt = parseFields(fields);
  if (stream === STREAMS.published) await onPublished(evt.entityId, evt.agentRef);
  else await onWithdraw(stream, evt.entityId, evt.agentRef);
}

export async function runConsumer(): Promise<void> {
  await ensureGroups();
  console.log(`[bridge] consuming ${STREAM_LIST.join(', ')} as ${GROUP}/${CONSUMER}`);
  for (;;) {
    try {
      // XREADGROUP wants all stream names first, then one '>' cursor per stream.
      const res = (await reader.xreadgroup(
        'GROUP', GROUP, CONSUMER,
        'COUNT', 10, 'BLOCK', 5000,
        'STREAMS', ...STREAM_LIST, ...STREAM_LIST.map(() => '>'),
      )) as [string, [string, string[]][]][] | null;
      if (!res) continue;
      for (const [stream, entries] of res) {
        for (const [id, fields] of entries) {
          try {
            await handle(stream as ConsumedStream, fields);
            await reader.xack(stream, GROUP, id);
          } catch (err) {
            console.error(`[bridge] handler error on ${stream} ${id}:`, err instanceof Error ? err.message : err);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NOGROUP')) {
        console.warn('[bridge] groups missing (flushed?) — recreating');
        await ensureGroups().catch(() => {});
      } else {
        console.error('[bridge] read loop error:', msg);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
