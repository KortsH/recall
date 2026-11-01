#!/bin/bash
set -euo pipefail
source /etc/recall-backup.conf
mountpoint -q "$BACKUP_MOUNT" || { echo 'Backup disk is not mounted; refusing to write to the underlying filesystem.'; exit 1; }
[ "$(findmnt -n -o UUID --target "$BACKUP_MOUNT")" = "$BACKUP_UUID" ] || { echo 'Unexpected backup disk UUID'; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$LOCAL_BACKUP_DIR" "$BACKUP_MOUNT/recall"
name="recall-$stamp.dump"
trap 'rm -f "$LOCAL_BACKUP_DIR/$name.tmp" "$BACKUP_MOUNT/recall/$name.tmp"' EXIT
docker exec "$PG_CONTAINER" pg_dump -U "$PG_ADMIN" -Fc recall >"$LOCAL_BACKUP_DIR/$name.tmp"
docker exec -i "$PG_CONTAINER" pg_restore --list <"$LOCAL_BACKUP_DIR/$name.tmp" >/dev/null
mv "$LOCAL_BACKUP_DIR/$name.tmp" "$LOCAL_BACKUP_DIR/$name"
cp "$LOCAL_BACKUP_DIR/$name" "$BACKUP_MOUNT/recall/$name.tmp"
sync -f "$BACKUP_MOUNT/recall/$name.tmp"
mv "$BACKUP_MOUNT/recall/$name.tmp" "$BACKUP_MOUNT/recall/$name"
(cd "$LOCAL_BACKUP_DIR" && sha256sum "$name" >"$name.sha256")
cp "$LOCAL_BACKUP_DIR/$name.sha256" "$BACKUP_MOUNT/recall/$name.sha256"
(cd "$BACKUP_MOUNT/recall" && sha256sum --check "$name.sha256")
sync -f "$BACKUP_MOUNT/recall"
echo "Verified Recall backup: $name (local disk + backup disk)"
