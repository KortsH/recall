# Local, shared-server, and mobile use

For installation without any server, use the Windows/Android downloads or browser app in the [README](../README.md#install-and-use). Device-only workspaces support offline authoring and portable quiz/progress files; PostgreSQL is only required for the optional shared-server mode described here. The owner's private deployment is not a public service for other installations.

One PostgreSQL database serves quizzes and progress to computers and phones. The owner's installation uses a private home server; its addresses, credentials, disk identifiers and operational handoff stay outside this public repository. Any Node + PostgreSQL host can run the app.

## Downloaded study mode

Settings → **Use downloaded study mode** downloads the complete bank and progress into IndexedDB. Questions, prerequisites, grading, repetition and timers run on the device. No per-answer server requests are made. Progress syncs in a batch at session finish, Save & leave, or explicit refresh; failures remain pending on the device.

**Sync progress & refresh quizzes** uploads pending evidence before downloading current questions and progress. New questions are deliberately not polled. Refresh each device to see changes from the other. Live-server mode remains available in Settings.

Initial download and editing/importing need a connection. Visit successfully online before relying on offline startup. Clearing site storage can remove unsynced attempts. Concurrent devices merge evidence rather than replacing progress. Corrected revisions exclude obsolete answers from mastery.

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

Keep live PostgreSQL on reliable application storage. A tested secondary drive can hold backup copies. `deploy/backup-home.sh` checks the archive and verifies a SHA-256 copy; its private configuration supplies the expected mount UUID. Perform a disposable restore before treating a backup as verified. Off-site backups remain separate work.
