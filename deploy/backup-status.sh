#!/bin/bash
set -euo pipefail
source "${RECALL_BACKUP_CONFIG:-/etc/recall-backup.conf}"
MAX_BACKUP_AGE_HOURS=${MAX_BACKUP_AGE_HOURS:-36}
[[ "$MAX_BACKUP_AGE_HOURS" =~ ^[0-9]+$ ]] && (( MAX_BACKUP_AGE_HOURS > 0 && MAX_BACKUP_AGE_HOURS <= 8760 )) || { echo 'Invalid MAX_BACKUP_AGE_HOURS' >&2; exit 1; }
last_success=$(cat "$LOCAL_BACKUP_DIR/.last-success" 2>/dev/null || true)
[[ "$last_success" =~ ^[0-9TZ:-]+$ ]] || last_success=''
epoch=$(date -u -d "$last_success" +%s 2>/dev/null || echo 0)
age=$(( $(date -u +%s) - epoch ))
status_file="$LOCAL_BACKUP_DIR/status.json"
healthy=false
if [[ -s "$status_file" && -n "$last_success" ]] && grep -q '"status":"success"' "$status_file" && (( age >= 0 && age <= MAX_BACKUP_AGE_HOURS * 3600 )); then healthy=true; fi
printf '{"healthy":%s,"lastSuccess":"%s","ageSeconds":%s,"maxAgeHours":%s,"lastRun":' "$healthy" "$last_success" "$age" "$MAX_BACKUP_AGE_HOURS"
if [[ -s "$status_file" ]]; then cat "$status_file"; else printf 'null'; fi
printf '}\n'
[[ "$healthy" == true ]]
