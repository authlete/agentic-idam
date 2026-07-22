#!/usr/bin/env bash
#
# cleanup.sh — reset the Agentic IDAM demo to a clean slate.
#
# Wipes ALL agent identities and related artefacts, everywhere:
#   - our services : trust-controller store, event streams, fed-bridge records (Redis :6380 db 1/2/4)
#   - entity-publisher : all published leaf configs (via POST /reset)
#   - Inmor : ALL subordinates + ALL trust marks (Postgres rows + Redis serving cache), including any pre-seeded ones
#
# KEEPS (governance infrastructure, so the demo is immediately re-runnable):
#   - trust mark TYPE definitions (Inmor `inmor:tmtypes` + TrustMarkType rows)
#   - the Trust Anchor entity config (`inmor:entity_id`), historical keys
#   Set WIPE_TYPES=1 to also delete the trust-mark-type definitions (then re-run /setup/bootstrap).
#
# Safe to run repeatedly. Continues past individual failures (e.g. a service being down).
#
# Usage:  ./cleanup.sh
# Config (env overrides): DEMO_REDIS, INMOR_REDIS, INMOR_ADMIN_DIR, ENTITY_PUBLISHER_URL,
#                         DB_STREAMS, DB_STORE, DB_BRIDGE, WIPE_TYPES

set -uo pipefail

DEMO_REDIS=${DEMO_REDIS:-demo-redis-1}
INMOR_REDIS=${INMOR_REDIS:-inmor-redis-1}
INMOR_ADMIN_DIR=${INMOR_ADMIN_DIR:-$HOME/agentic/inmor/admin}
ENTITY_PUBLISHER_URL=${ENTITY_PUBLISHER_URL:-http://localhost:8092}
DB_STREAMS=${DB_STREAMS:-1}
DB_STORE=${DB_STORE:-2}
DB_BRIDGE=${DB_BRIDGE:-4}
WIPE_TYPES=${WIPE_TYPES:-0}

dredis() { docker exec "$DEMO_REDIS" redis-cli "$@"; }
iredis()  { docker exec "$INMOR_REDIS" redis-cli "$@"; }

echo "== 1. our services' data (${DEMO_REDIS}) =="
for db in "$DB_STREAMS" "$DB_STORE" "$DB_BRIDGE"; do
  dredis -n "$db" FLUSHDB >/dev/null 2>&1 && echo "   flushed db$db" || echo "   db$db flush FAILED (is ${DEMO_REDIS} up?)"
done

echo "== 2. entity-publisher leaves =="
if curl -fsS -XPOST "$ENTITY_PUBLISHER_URL/reset" >/dev/null 2>&1; then
  echo "   /reset ok"
else
  echo "   entity-publisher not reachable (skip; a restart also clears its in-memory leaves)"
fi

echo "== 3. Inmor Postgres rows (ALL subordinates + trust marks) =="
if [ -x "$INMOR_ADMIN_DIR/.venv/bin/python" ]; then
  ( cd "$INMOR_ADMIN_DIR" && .venv/bin/python manage.py shell -c "
from entities.models import Subordinate
from trustmarks.models import TrustMark
print('   marks:', TrustMark.objects.count(), '| subordinates:', Subordinate.objects.count(), '-> deleting ALL')
TrustMark.objects.all().delete()
Subordinate.objects.all().delete()
if '${WIPE_TYPES}' == '1':
    from trustmarks.models import TrustMarkType
    print('   trust mark TYPES:', TrustMarkType.objects.count(), '-> deleting ALL')
    TrustMarkType.objects.all().delete()
" 2>&1 | grep -vE 'System check|WARNINGS|staticfiles|objects imported' )
else
  echo "   Inmor admin venv not found at $INMOR_ADMIN_DIR (skip Postgres wipe)"
fi

echo "== 4. Inmor Redis serving cache =="
iredis DEL inmor:subordinates inmor:subordinates:jwt inmor:rp inmor:tm:alltime inmor:newsubordinate >/dev/null 2>&1
# per-domain mark hashes: inmor:tm:<domain>  (exclude the alltime set already handled)
iredis --scan --pattern 'inmor:tm:*' 2>/dev/null | grep -v '^inmor:tm:alltime$' | while read -r k; do
  [ -n "$k" ] && iredis DEL "$k" >/dev/null 2>&1
done
# trust-mark-type reverse indexes: inmor:tmtype:<url>  (NOT inmor:tmtypes, the definitions)
iredis --scan --pattern 'inmor:tmtype:*' 2>/dev/null | while read -r k; do
  [ -n "$k" ] && iredis DEL "$k" >/dev/null 2>&1
done
if [ "$WIPE_TYPES" = "1" ]; then
  iredis DEL inmor:tmtypes >/dev/null 2>&1
  echo "   cleared subordinates + marks + type definitions"
else
  echo "   cleared subordinates + marks + reverse indexes (type definitions kept)"
fi

echo "== VERIFY =="
echo "   our tc-store (db$DB_STORE): $(dredis -n "$DB_STORE" DBSIZE 2>/dev/null) keys"
echo "   inmor subordinates served : $(iredis HLEN inmor:subordinates:jwt 2>/dev/null || echo 0)"
echo "   inmor keys mentioning 8092: $(iredis --scan --pattern '*8092*' 2>/dev/null | wc -l | tr -d ' ')"
echo
echo "Done. Demo is clean."
echo "If you kept types (default), the demo is re-runnable as-is. Otherwise re-init with:"
echo "   curl -XPOST http://localhost:8091/setup/bootstrap"
