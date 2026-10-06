// Vouch API facade. The Trust Controller is the Trust Anchor: it governs through Vouch's management
// ops AND serves the OpenID Federation endpoints by relaying to Vouch's serve ops (see callServe +
// routes/federation.ts). Vouch owns the protocol + crypto behind a private engine, so the TC never
// talks to that engine directly.
//
//   management (writes) -> manage() (anchor, subordinates, trust-mark types, trust marks)
//   serve (reads)       -> callServe() (entity configuration, fetch, list, resolve, trust mark, ...)

import { config } from '../config.js';
import type { JwkSet } from '../domain/types.js';

/** The anchor entity_id agents point their `authority_hints` at. */
export function trustAnchorUrl(): string {
  return config.anchor.entityId;
}

export class VouchError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: unknown,
  ) {
    super(`vouch ${path} -> ${status}: ${JSON.stringify(body)}`);
    this.name = 'VouchError';
  }
}

async function manage<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.vouch.baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.vouch.bearer}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new VouchError(res.status, path, parsed);
  return parsed as T;
}

// ---- Anchor (server entity) ----

/** Ensure the anchor exists and (re)generate its entity configuration. Idempotent. */
export async function ensureServerEntity(): Promise<void> {
  await manage<unknown>('/v1/anchors', 'POST', { entityId: config.anchor.entityId, type: 'trust_anchor' });
}

// ---- Trust mark types ----

export async function ensureTrustMarkType(type: string): Promise<void> {
  await manage<unknown>(pathFor('trust-mark-types'), 'POST', { type });
}

// ---- Trust marks ----

export interface IssuedTrustMark {
  id: number;
  trustMark: string;
}

export async function issueTrustMark(args: { type: string; sub: string }): Promise<IssuedTrustMark> {
  const rec = await manage<{ id: number; trustMark: string }>(pathFor('trust-marks'), 'POST', { type: args.type, sub: args.sub });
  return { id: rec.id, trustMark: rec.trustMark };
}

export async function revokeTrustMark(id: number): Promise<void> {
  await manage<unknown>(`${pathFor('trust-marks')}/${id}/revoke`, 'POST', {});
}

// ---- Subordinates ----

export interface SubordinateRecord {
  id: number;
}

export async function createSubordinate(args: {
  entityId: string;
  metadata: Record<string, unknown>;
  jwks: JwkSet;
  requiredTrustMarks?: string;
}): Promise<SubordinateRecord> {
  const rec = await manage<{ subId: number }>(pathFor('subordinates'), 'POST', {
    entityId: args.entityId,
    metadata: args.metadata,
    jwks: args.jwks,
    ...(args.requiredTrustMarks ? { requiredTrustMarks: args.requiredTrustMarks } : {}),
  });
  return { id: rec.subId };
}

export async function deactivateSubordinate(id: number): Promise<void> {
  await manage<unknown>(`${pathFor('subordinates')}/${id}`, 'DELETE');
}

export async function reactivateSubordinate(id: number, metadata: Record<string, unknown>, jwks: JwkSet): Promise<void> {
  await manage<unknown>(`${pathFor('subordinates')}/${id}`, 'PATCH', { metadata, jwks, active: true });
}

function pathFor(resource: string): string {
  return `/v1/anchors/${encodeURIComponent(config.vouch.anchorId)}/${resource}`;
}

// ---- Serve (the OpenID Federation endpoints the TC exposes as the Trust Anchor) ----
// Each serve op forwards the raw request parameters to Vouch and returns the relay envelope, which
// the federation routes pass back verbatim.

export interface ServeEnvelope {
  action: string;
  httpStatus: number;
  contentType: string;
  responseContent: string;
}

// Never throws: a serve failure becomes a 502 envelope so the federation routes always have
// something well-formed to relay (unlike manage(), which throws VouchError on error).
export async function callServe(op: string, parameters: string): Promise<ServeEnvelope> {
  const res = await fetch(`${config.vouch.baseUrl}${pathFor(op)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.vouch.bearer}` },
    body: JSON.stringify({ parameters }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return { action: 'SERVER_ERROR', httpStatus: 502, contentType: 'application/json', responseContent: detail || '{"error":"vouch_unavailable"}' };
  }
  return (await res.json()) as ServeEnvelope;
}

// ---- Resolve summary (for the console federation view) ----
// Resolves the entity against this anchor via Vouch and summarizes the chain + verified marks.

export interface ResolveSummary {
  trustChainLength: number;
  verifiedMarkTypes: string[];
}

export async function resolveEntity(entityId: string): Promise<ResolveSummary | null> {
  try {
    const params = `sub=${encodeURIComponent(entityId)}&trust_anchor=${encodeURIComponent(config.anchor.entityId)}`;
    const env = await callServe('resolve', params);
    if (env.action !== 'OK') return null;
    const payloadB64 = env.responseContent.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      trust_chain?: unknown[];
      trust_marks?: { trust_mark_type?: string }[];
    };
    return {
      trustChainLength: payload.trust_chain?.length ?? 0,
      verifiedMarkTypes: (payload.trust_marks ?? []).map((m) => m.trust_mark_type ?? '').filter(Boolean),
    };
  } catch {
    return null;
  }
}
