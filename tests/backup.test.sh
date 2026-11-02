#!/bin/bash
set -euo pipefail
repo=$(pwd)
test_tmp=${TMPDIR:-/tmp}
if command -v cygpath >/dev/null; then test_tmp=$(cygpath -u "${TEMP:-$test_tmp}"); fi
sandbox=$(mktemp -d "$test_tmp/recall-backup-test.XXXXXX")
cleanup() { [[ "$sandbox" == *"/recall-backup-test."* ]] && rm -rf -- "$sandbox"; }
trap cleanup EXIT
mkdir -p "$sandbox/bin" "$sandbox/local" "$sandbox/disk"
export MOCK_ROOT="$sandbox"
export RECALL_BACKUP_CONFIG="$sandbox/config"
printf 'LOCAL_BACKUP_DIR=%q\nBACKUP_MOUNT=%q\nBACKUP_UUID=test-uuid\nPG_CONTAINER=test-db\nPG_ADMIN=test-role\nBACKUP_RETENTION_COUNT=2\nBACKUP_ALERT_HOOK=%q\n' "$sandbox/local" "$sandbox/disk" "$sandbox/bin/alert" >"$RECALL_BACKUP_CONFIG"
cat >"$sandbox/bin/mountpoint" <<'MOCK'
#!/bin/bash
[[ ! -f "$MOCK_ROOT/unmounted" ]]
MOCK
cat >"$sandbox/bin/findmnt" <<'MOCK'
#!/bin/bash
if [[ -f "$MOCK_ROOT/wrong-disk" ]]; then echo wrong-uuid; else echo test-uuid; fi
MOCK
cat >"$sandbox/bin/flock" <<'MOCK'
#!/bin/bash
[[ ! -f "$MOCK_ROOT/locked" ]]
MOCK
cat >"$sandbox/bin/sync" <<'MOCK'
#!/bin/bash
exit 0
MOCK
cat >"$sandbox/bin/alert" <<'MOCK'
#!/bin/bash
printf '%s\n' "$1" >>"$MOCK_ROOT/alerts"
MOCK
cat >"$sandbox/bin/docker" <<'MOCK'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >>"$MOCK_ROOT/docker-calls"
case " $* " in
  *' pg_dump '*) [[ ! -f "$MOCK_ROOT/dump-failed" ]]; printf 'PGDMP synthetic archive';;
  *' pg_restore '*) data=$(cat); [[ "$data" == 'PGDMP synthetic archive' ]]; if [[ " $* " == *' --exit-on-error '* ]]; then [[ ! -f "$MOCK_ROOT/restore-failed" ]]; fi;;
  *' createdb '*|*' dropdb '*) [[ "${*: -1}" == recall_verify_* ]];;
  *' psql '*) printf 't\n';;
  *) exit 99;;
esac
MOCK
chmod +x "$sandbox/bin/"*
export PATH="$sandbox/bin:$PATH"
fail() { echo "FAILED: $*" >&2; exit 1; }
count_archives() { find "$1" -maxdepth 1 -name '*.dump' | wc -l | tr -d ' '; }
if bash "$repo/deploy/backup-status.sh" >"$sandbox/status"; then fail 'empty backup directory must not be healthy'; fi
for n in 1 2 3 4; do bash "$repo/deploy/backup-home.sh" >"$sandbox/output"; done
[[ "$(count_archives "$sandbox/local")" == 2 ]] || fail 'application-disk retention'
[[ "$(count_archives "$sandbox/disk/recall")" == 2 ]] || fail 'backup-disk retention'
bash "$repo/deploy/backup-status.sh" >"$sandbox/status"
grep -q '"healthy":true' "$sandbox/status" || fail 'successful status'
grep -q '"restoreVerified":true' "$sandbox/status" || fail 'restore check missing'
for directory in "$sandbox/local" "$sandbox/disk/recall"; do (cd "$directory" && for sum in *.sha256; do sha256sum --check "$sum" >/dev/null; done); done
printf 'unrelated' >"$sandbox/local/recall-keep-me.dump"
for failure in unmounted wrong-disk dump-failed restore-failed; do
  touch "$sandbox/$failure"
  before=$(find "$sandbox/local" -maxdepth 1 -name '*.dump' -printf '%f\n' | sort)
  if bash "$repo/deploy/backup-home.sh" >"$sandbox/output" 2>"$sandbox/error"; then fail "$failure should fail"; fi
  [[ "$before" == "$(find "$sandbox/local" -maxdepth 1 -name '*.dump' -printf '%f\n' | sort)" ]] || fail "$failure must not prune verified archives"
  grep -q '"status":"failed"' "$sandbox/local/status.json" || fail "$failure missing failure status"
  grep -q '"restoreVerified":false' "$sandbox/local/status.json" || fail "$failure must not claim a successful restore"
  if bash "$repo/deploy/backup-status.sh" >"$sandbox/status"; then fail "$failure reported healthy"; fi
  rm -f "$sandbox/$failure"
done
[[ "$(wc -l <"$sandbox/alerts" | tr -d ' ')" == 4 ]] || fail 'alert hook must run for each failure'
grep -q 'dropdb.*--if-exists recall_verify_' "$sandbox/docker-calls" || fail 'failed restore did not clean its isolated database'
bash "$repo/deploy/backup-home.sh" >/dev/null
[[ -f "$sandbox/local/recall-keep-me.dump" ]] || fail 'retention removed an unrecognized file'
printf '2000-01-01T00:00:00Z\n' >"$sandbox/local/.last-success"
if bash "$repo/deploy/backup-status.sh" >"$sandbox/status"; then fail 'stale backups reported healthy'; fi
touch "$sandbox/locked"
if bash "$repo/deploy/backup-home.sh" >/dev/null 2>&1; then fail 'concurrent backup should be rejected'; fi
echo 'Backup retention, checksums, isolated restore, disk guards, failure hooks, staleness and lock checks passed.'
