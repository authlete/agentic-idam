#!/usr/bin/env bash
# Generate .env files to run the customer-side stack LOCALLY against the HOSTED Vouch.
#
# Topology:
#   LOCAL  (your laptop): reference trust-anchor, trust-controller, fed-bridge, console, Redis.
#   HOSTED (GKE, public): Vouch API, the private engine, the public reference Trust Anchor
#          (ta.trust.authlete.dev), and the entity-publisher (rp.trust.authlete.dev).
#
# Why some pieces stay hosted: OpenID Federation requires the engine to DEREFERENCE entity_ids over
# the network. The remote engine must fetch each agent leaf (entity-publisher) and the Trust Anchor
# during trust-chain resolution. Those must therefore be publicly reachable, so leaves are published
# to the hosted entity-publisher and the anchor entity_id stays https://ta.trust.authlete.dev.
# Your local Trust Controller / Fed Bridge / console only make OUTBOUND calls, so they run anywhere.
set -euo pipefail

VOUCH_BASE_URL="${VOUCH_BASE_URL:-https://vouch.trust.authlete.dev}"
VOUCH_BEARER="${VOUCH_BEARER:?set VOUCH_BEARER (the token printed by the operator)}"
ANCHOR_ID="${ANCHOR_ID:-cba-agents}"
TA="https://ta.trust.authlete.dev"
RP="https://rp.trust.authlete.dev"
TC_NS="https://tc.trust.authlete.dev"   # trust-mark TYPE namespace; must match the hosted bootstrap
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "Fetching the anchor JWKS (engine public keys) for fed-bridge..."
JWKS=$(curl -s --max-time 15 "$TA/.well-known/openid-federation" | awk -F. '{print $2}' | tr '_-' '/+' | base64 -d 2>/dev/null \
  | python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin)['jwks']))")

cat > "$HERE/trust-anchor/.env" <<EOF
PORT=8095
VOUCH_BASE_URL=$VOUCH_BASE_URL
ANCHOR_ID=$ANCHOR_ID
VOUCH_BEARER=$VOUCH_BEARER
EOF

cat > "$HERE/trust-controller/.env" <<EOF
PORT=8091
TC_BASE_URL=$TC_NS
REDIS_URL=redis://localhost:6380
REDIS_DB_STREAMS=1
REDIS_DB_STORE=2
VOUCH_BASE_URL=$VOUCH_BASE_URL
VOUCH_BEARER=$VOUCH_BEARER
ANCHOR_ID=$ANCHOR_ID
# Hybrid override: the hosted anchor is the reachable Trust Anchor (the local TC can't be the
# entity_id because the hosted engine must dereference it). In an all-hosted deploy this is omitted
# and defaults to TC_BASE_URL.
TRUST_ANCHOR_ENTITY_ID=$TA
ENTITY_PUBLISHER_URL=$RP
AGENT_BASE_URL=$RP/agents
EOF

cat > "$HERE/fed-bridge/.env" <<EOF
PORT=8093
REDIS_URL=redis://localhost:6380
REDIS_DB_STREAMS=1
REDIS_DB_STORE=4
TC_BASE_URL=http://localhost:8091
TRUST_ANCHOR_URL=$TA
TRUST_ANCHOR_JWKS=$JWKS
DCR_REGISTRATION_ENDPOINT=https://authlete-as.vercel.app/api/register
DCR_TOKEN_AUTH_METHOD=private_key_jwt
EOF

cat > "$HERE/console/.env.local" <<EOF
NEXT_PUBLIC_TC_URL=http://localhost:8091
NEXT_PUBLIC_BRIDGE_URL=http://localhost:8093
EOF

echo "Wrote: trust-anchor/.env, trust-controller/.env, fed-bridge/.env, console/.env.local"
cat <<'NEXT'

Next:
  docker compose up -d                                  # local Redis on :6380
  (cd trust-anchor     && npm i && npm run start) &     # :8095 (relays to hosted Vouch)
  (cd trust-controller && npm i && npm run start) &     # :8091
  (cd fed-bridge       && npm i && npm run start) &     # :8093
  (cd console          && npm i && npm run dev)         # http://localhost:8090

The hosted anchor is already bootstrapped. Open the console, onboard an agent, approve, and watch
the Fed Bridge register a real client — all driven from your laptop against the hosted Vouch.
NEXT
