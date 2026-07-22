// In-memory leaf store, keyed by the agent slug (last path segment of the entity_id).
// Demo-only: leaves live as long as the process. Keep this service up during a demo; a restart
// re-publishes on the next approve. (Production would persist keys in KMS + a datastore.)

import type { LeafRecord } from './leaf.js';

const leaves = new Map<string, LeafRecord>();

export function slugOf(entityId: string): string {
  return entityId.replace(/\/+$/, '').split('/').pop() ?? entityId;
}

export function put(record: LeafRecord): void {
  leaves.set(slugOf(record.entityId), record);
}

export function getBySlug(slug: string): LeafRecord | undefined {
  return leaves.get(slug);
}

/** Withdraw a leaf: after this, its /.well-known/openid-federation returns 404 so the trust chain
 *  can no longer be built (breaks resolution at the source). Returns true if one was removed. */
export function remove(entityId: string): boolean {
  return leaves.delete(slugOf(entityId));
}

/** Clear every published leaf (used by the cleanup script's /reset). */
export function clear(): number {
  const n = leaves.size;
  leaves.clear();
  return n;
}

export function count(): number {
  return leaves.size;
}
