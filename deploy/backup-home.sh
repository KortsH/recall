#!/bin/bash
set -euo pipefail
source "${RECALL_BACKUP_CONFIG:-/etc/recall-backup.conf}"
BACKUP_RETENTION_COUNT=${BACKUP_RETENTION_COUNT:-30}
VERIFY_RESTORE=${VERIFY_RESTORE:-true}
PG_DATABASE=${PG_DATABASE:-recall}
[[ "$BACKUP_RETENTION_COUNT" =~ ^[0-9]+$ ]] && (( BACKUP_RETENTION_COUNT >= 2 && BACKUP_RETENTION_COUNT <= 100000 )) || { echo 'BACKUP_RETENTION_COUNT must be 2–100000'; exit 1; }
[[ "$VERIFY_RESTORE" == true || "$VERIFY_RESTORE" == false ]] || { echo 'VERIFY_RESTORE must be true or false'; exit 1; }
[[ "$LOCAL_BACKUP_DIR" == /* && "$LOCAL_BACKUP_DIR" != / && "$BACKUP_MOUNT" == /* && "$BACKUP_MOUNT" != / && "$LOCAL_BACKUP_DIR" != "$BACKUP_MOUNT" ]] || { echo 'Use distinct absolute application and backup-disk directories'; exit 1; }
install -d -m 700 "$LOCAL_BACKUP_DIR"
exec 9>"$LOCAL_BACKUP_DIR/.backup.lock"
flock -n 9 || { echo 'Another Recall backup is running'; exit 1; }
phase=mount-check
name=''
restore_db=''
restore_verified=false
last_success=$(cat "$LOCAL_BACKUP_DIR/.last-success" 2>/dev/null || true)
[[ "$last_success" =~ ^[0-9TZ:-]+$ ]] || last_success=''
status_file="$LOCAL_BACKUP_DIR/status.json"
write_status() {
  printf '{"status":"%s","phase":"%s","at":"%s","lastSuccessfulAt":"%s","archive":"%s","retentionCount":%s,"restoreVerified":%s}\n' "$1" "$phase" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$last_success" "$name" "$BACKUP_RETENTION_COUNT" "$restore_verified" >"$status_file.tmp"
  chmod 600 "$status_file.tmp"
  mv "$status_file.tmp" "$status_file"
}
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$restore_db" =~ ^recall_verify_[a-z0-9_]+$ ]]; then docker exec "$PG_CONTAINER" dropdb -U "$PG_ADMIN" --if-exists "$restore_db" >/dev/null 2>&1 || true; fi
  if [[ -n "$name" ]]; then
    rm -f -- "$LOCAL_BACKUP_DIR/$name.tmp"
    if declare -F verify_disk >/dev/null && verify_disk >/dev/null 2>&1; then rm -f -- "$BACKUP_MOUNT/recall/$name.tmp"; fi
  fi
  if (( result != 0 )); then
    write_status failed || true
    echo "Recall backup FAILED during $phase. Inspect recall-backup.service and status.json; previous verified archives were retained." >&2
    if [[ -n "${BACKUP_ALERT_HOOK:-}" ]]; then
      if [[ "$BACKUP_ALERT_HOOK" == /* && -x "$BACKUP_ALERT_HOOK" ]]; then "$BACKUP_ALERT_HOOK" "$phase" "$status_file" || echo 'Backup alert hook failed' >&2; else echo 'Backup alert hook must be an absolute executable path' >&2; fi
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
verify_disk() {
  mountpoint -q "$BACKUP_MOUNT" || { echo 'Backup disk is not mounted; refusing to use the underlying filesystem.' >&2; return 1; }
  [[ "$(findmnt -n -o UUID --target "$BACKUP_MOUNT")" == "$BACKUP_UUID" ]] || { echo 'Unexpected backup disk UUID' >&2; return 1; }
}
verify_disk
install -d -m 700 "$BACKUP_MOUNT/recall"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="recall-$stamp-$$.dump"
phase=database-dump
docker exec "$PG_CONTAINER" pg_dump -U "$PG_ADMIN" -Fc "$PG_DATABASE" >"$LOCAL_BACKUP_DIR/$name.tmp"
chmod 600 "$LOCAL_BACKUP_DIR/$name.tmp"
phase=archive-check
docker exec -i "$PG_CONTAINER" pg_restore --list <"$LOCAL_BACKUP_DIR/$name.tmp" >/dev/null
if [[ "$VERIFY_RESTORE" == true ]]; then
  phase=restore-check
  restore_db="recall_verify_${stamp,,}_$$"
  docker exec "$PG_CONTAINER" createdb -U "$PG_ADMIN" "$restore_db"
  docker exec -i "$PG_CONTAINER" pg_restore --exit-on-error --no-owner --no-acl -U "$PG_ADMIN" -d "$restore_db" <"$LOCAL_BACKUP_DIR/$name.tmp"
  [[ "$(docker exec "$PG_CONTAINER" psql -U "$PG_ADMIN" -d "$restore_db" -tAc "SELECT to_regclass('public.questions') IS NOT NULL AND to_regclass('public.progress') IS NOT NULL AND to_regclass('public.sessions') IS NOT NULL")" == t ]]
  docker exec "$PG_CONTAINER" dropdb -U "$PG_ADMIN" "$restore_db"
  restore_db=''
  restore_verified=true
fi
phase=verified-copy
mv "$LOCAL_BACKUP_DIR/$name.tmp" "$LOCAL_BACKUP_DIR/$name"
(cd "$LOCAL_BACKUP_DIR" && sha256sum "$name" >"$name.sha256")
chmod 600 "$LOCAL_BACKUP_DIR/$name.sha256"
verify_disk
cp "$LOCAL_BACKUP_DIR/$name" "$BACKUP_MOUNT/recall/$name.tmp"
sync -f "$BACKUP_MOUNT/recall/$name.tmp"
mv "$BACKUP_MOUNT/recall/$name.tmp" "$BACKUP_MOUNT/recall/$name"
cp "$LOCAL_BACKUP_DIR/$name.sha256" "$BACKUP_MOUNT/recall/$name.sha256"
(cd "$BACKUP_MOUNT/recall" && sha256sum --check "$name.sha256")
sync -f "$BACKUP_MOUNT/recall"
phase=retention
verify_disk
prune() {
  local directory=$1 count=1 file
  while IFS= read -r file; do
    [[ "$file" =~ ^recall-[0-9]{8}T[0-9]{6}Z(-[0-9]+)?\.dump$ ]] || continue
    [[ "$file" == "$name" ]] && continue
    count=$((count + 1))
    if (( count > BACKUP_RETENTION_COUNT )); then rm -f -- "$directory/$file" "$directory/$file.sha256"; fi
  done < <(find "$directory" -maxdepth 1 -type f -name 'recall-*.dump' -printf '%f\n' | LC_ALL=C sort -r)
}
prune "$LOCAL_BACKUP_DIR"
prune "$BACKUP_MOUNT/recall"
phase=complete
last_success=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '%s\n' "$last_success" >"$LOCAL_BACKUP_DIR/.last-success.tmp"
mv "$LOCAL_BACKUP_DIR/.last-success.tmp" "$LOCAL_BACKUP_DIR/.last-success"
write_status success
echo "Verified Recall backup: $name (application disk + backup disk; retention $BACKUP_RETENTION_COUNT; restore check $VERIFY_RESTORE)"
