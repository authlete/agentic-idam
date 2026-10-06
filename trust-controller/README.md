# trust-controller

The **control plane**: it owns the Agent Identity (aggregate + lifecycle state machine + capability
envelope) and governs trust through the **Vouch API**. On approve it issues trust marks, publishes
the agent's leaf entity config, creates the subordinate, and emits a lifecycle event the Federation
Bridge consumes.

## Run

```bash
docker compose -f ../docker-compose.yml up -d   # our Redis on :6380
cp .env.example .env                             # set VOUCH_BASE_URL + VOUCH_BEARER
npm install && npm run dev                       # http://localhost:8091
curl -XPOST localhost:8091/setup/bootstrap       # one-time: trust-mark types, then TA entity config
```

## API

- `POST /identities` — onboard from a manifest (owner required) → `pending_approval`
- `GET  /identities[?state=…]` · `GET /identities/:entityId` — list / detail
- `GET  /identities/:entityId/federation` — resolved trust chain + verified marks
- `POST /identities/:entityId/transition/{approve|reapprove|suspend|revoke|retire}` — lifecycle
- `POST /identities/:entityId/binding` — a bridge reconciles its result (e.g. `client_id`) back
- `POST /setup/bootstrap` — one-time federation setup

See `src/index.ts` for the internal folder layout (`clients` / `infra` / `domain` / `services` / `routes`).
