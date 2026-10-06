# trust-anchor (reference)

A minimal, hello-world OpenID Federation Trust Anchor built on the **Vouch** API. It owns an
`entity_id` and exposes the standard federation endpoints, but holds no protocol logic of its own:
each endpoint forwards the raw request to a Vouch serve operation and relays the response verbatim.

This exists to show how little it takes to stand up a conformant Trust Anchor on Vouch. For a
production-grade Trust Anchor with governance, lifecycle, and policy, see the **Trust Controller**,
which is built on the same Vouch API.

## Endpoints

Standard OpenID Federation, each a one-line relay to Vouch:
`/.well-known/openid-federation`, `/fetch`, `/list`, `/resolve`, `/trust_mark`,
`/trust_mark_status`, `/trust_mark_list`, `/historical_keys`.

## Run

```bash
cp .env.example .env    # set VOUCH_BASE_URL, VOUCH_BEARER, ANCHOR_ID
npm install && npm run start   # http://localhost:8095
```

It needs only three things: which anchor it fronts (`ANCHOR_ID`), where Vouch is
(`VOUCH_BASE_URL`), and the Bearer token to call it (`VOUCH_BEARER`).
