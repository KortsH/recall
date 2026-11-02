# Local, shared-server, and mobile use

For installation without any server, use the Windows/Android downloads or browser app in the [README](../README.md#install-and-use). Device-only workspaces support offline authoring and portable quiz/progress files; PostgreSQL is only required for the optional shared-server mode described here. The owner's private deployment is not a public service for other installations.

One PostgreSQL database serves quizzes and progress to computers and phones. The owner's installation uses a private home server; its addresses, credentials, disk identifiers and operational handoff stay outside this public repository. Any Node + PostgreSQL host can run the app.

## Downloaded study mode

Settings → **Use downloaded study mode** downloads the complete bank and progress into IndexedDB. Questions, prerequisites, grading, repetition and timers run on the device. No per-answer server requests are made. Progress syncs in a batch at session finish, Save & leave, or explicit refresh; failures remain pending on the device.

**Sync progress & refresh quizzes** uploads pending evidence before downloading current questions and progress. New questions are deliberately not polled. Refresh each device to see changes from the other. Live-server mode remains available in Settings.

The initial download needs a connection. After that, question edits, new questions, imports, hints/flags, prerequisite changes and topic organization save locally while disconnected. Sync uploads immutable edit batches in order; a full before/after comparison detects conflicts even for metadata changes that keep the same grading revision. Settings shows both versions and requires explicit choices. Successful batch receipts make retrying a lost acknowledgement safe. No batch partly commits.

New or corrected learning content stays visible in the library as **Awaiting sync** and enters server-backed study after the server acknowledges its revision. This prevents unpublished answers from earning shared mastery under a guessed revision. Existing published questions remain available offline. Device-only workspaces can study newly authored content immediately because there is no server revision to await.

Visit successfully online before relying on offline startup. Clearing site storage can remove unsynced attempts and edits. Concurrent devices merge study evidence rather than replacing progress. Corrected revisions exclude obsolete answers from mastery. The workspace upgrade copies existing learning/session data locally and retains the older storage snapshot; versioned storage keys prevent old app tabs from overwriting the new edit queue.

## Phone app

Open your HTTPS URL in Chrome (Android) or Safari (iPhone) and choose **Install app / Add to Home Screen**. Android also has a [bundled native container](../mobile/README.md) with device-only study and an optional server connection. Choose your own server address explicitly to use shared progress; no deployment address is embedded. [Portable files](PORTABLE.md) work across clients. Native iOS remains future work.

## CLI against the same server

Set `RECALL_SERVER_URL` in your ignored `.env`, or pass an explicit URL:

```sh
recall --server https://recall.example.test decks --json
recall questions "My Deck" --json
recall prerequisites "My Deck"
recall import bank.json --replace --dry-run --json
recall import bank.json --replace --json
```

`npm run local` uses a loopback proxy when `RECALL_SERVER_URL` is set. For an independent local installation, omit it and configure `DATABASE_URL`. Never commit private settings or study banks.

## Hosting elsewhere

Standard Docker Compose includes PostgreSQL. `compose.home.yaml` connects to an existing private Docker network. Create a private env file with `DATABASE_URL`, `RECALL_ALLOWED_ORIGINS` (your exact HTTPS origin), and `RECALL_POSTGRES_NETWORK`. Supply it for Compose interpolation as well as container configuration:

```sh
RECALL_ENV_FILE=/path/to/private.env docker compose --env-file /path/to/private.env -f compose.home.yaml up -d --build --wait
```

Publish the app only to loopback, behind HTTPS and private network access. Add authentication before public or multi-user hosting. Do not publish PostgreSQL. Host-header and Origin checks supplement private network access; they are not authentication.

## Data migration and backup

Deck JSON export includes questions and prerequisites. A PostgreSQL `pg_dump -Fc` also includes progress, sessions, attempts and archived records. Restore to an empty dedicated database with `pg_restore --no-owner --no-acl` and a compatible PostgreSQL client. Back up before migration or bulk replacement.

Keep live PostgreSQL on reliable application storage. A tested secondary drive can hold backup copies. `deploy/backup-home.sh` checks the archive, restores it into an isolated temporary database by default, and verifies a SHA-256 copy on the configured disk. A mount/UUID check prevents writing to the underlying application disk when that drive is missing. Only recognized Recall archives are pruned, after all checks succeed; at least two rollback points remain. The current archive is always retained.

Copy `deploy/backup.conf.example` to a private root-owned `/etc/recall-backup.conf` (mode 600), and set your container/role, directories and expected mount UUID. `BACKUP_RETENTION_COUNT` defaults to 30 per disk; `VERIFY_RESTORE=true` requires the backup role to create/drop its isolated `recall_verify_*` database. Application and backup paths must be distinct absolute paths. Do not put this private configuration into Git.

Install `backup-home.sh` as `/usr/local/sbin/recall-backup.sh`, `backup-status.sh` as `/usr/local/sbin/recall-backup-status.sh`, and the supplied service/timer/alert units into `/etc/systemd/system/`. Run `systemctl daemon-reload`, then enable the timer. `systemctl start recall-backup.service` performs a manual backup. A missing disk now fails visibly rather than skipping the service silently.

`status.json` records the last run, failed stage, most recent success and restore-verification result. The failure trap preserves previous verified archives, cleans its temporary database and reports to the service journal. `recall-backup-alert.service` also emits a journal error. An optional absolute executable `BACKUP_ALERT_HOOK` receives the failed stage and status-file path for an owner's own notifier; no notification service or credentials are built in.

Run `sudo /usr/local/sbin/recall-backup-status.sh` for machine-readable health and a nonzero exit on failed, absent or stale backups. `MAX_BACKUP_AGE_HOURS` defaults to 36. The daily timer and these local checks are sufficient for the personal deployment; off-site storage and paid signing/certification are outside the current project scope. Two disks in one machine are still not an off-site copy.
