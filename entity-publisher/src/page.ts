// The friendly landing page served at the entity_id itself. The entity_id is only an identifier in
// OpenID Federation (resolvers use the /.well-known path), but a small page here beats a bare 404
// and confirms the entity is live. PUBLIC info only — never the private key.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
}

export function landingPage(leaf: { entityId: string; metadata: Record<string, unknown> }): string {
  const rp = (leaf.metadata.openid_relying_party ?? {}) as Record<string, unknown>;
  const name = typeof rp.client_name === 'string' ? rp.client_name : leaf.entityId;
  const wellKnown = `${leaf.entityId}/.well-known/openid-federation`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title>
<style>
  body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#23233b;background:#fbfaf7;margin:0;padding:48px}
  .card{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e6e2d9;border-radius:12px;padding:28px 32px}
  .kicker{color:#7a7a8c;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:14px}
  h1{font-size:22px;margin:0 0 6px}
  .id{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#555;word-break:break-all}
  a{color:#2f4b7c}
</style></head>
<body><div class="card">
  <div class="kicker">Agent entity</div>
  <h1>${escapeHtml(name)}</h1>
  <div class="id">${escapeHtml(leaf.entityId)}</div>
  <p><a href="${escapeHtml(wellKnown)}">OpenID Federation entity configuration &rarr;</a></p>
</div></body></html>`;
}
