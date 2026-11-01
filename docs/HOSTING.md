# Local, home-server, and mobile use

The owner's deployment uses the existing PostgreSQL instance on the home server, with a dedicated `recall` database and `recall_app` role. It is privately served through Tailscale at **https://recall.example.test:8445**. Both computer and phone use that database. Phone access requires Tailscale connectivity.

The live database stays on the server's current application disk. The separately tested 80 GB drive is a Recall backup destination, not live PostgreSQL storage. This avoids moving the fitness database. Machine-specific drive reports and credentials stay outside Git.

## Downloaded study mode

Settings → **Use downloaded study mode** downloads the complete bank and current progress into IndexedDB. Questions, answer checking, repetitions, timers and results run on the device using the shared engine. Answering does not fetch from the server. Progress syncs in a batch at session finish, Save & leave, or explicit refresh; failed syncs stay pending on the device.

**Sync progress & refresh quizzes** uploads pending evidence before downloading current questions/progress. New questions are deliberately not polled. Refresh each device to see work done on the other. Live-server mode remains available in Settings.

Initial download and question editing/importing need a connection. The app shell is cached by a service worker; do one successful online visit before relying on offline startup. Clearing site storage can remove unsynced attempts. Concurrent offline devices merge evidence on receipt; they do not overwrite each other's progress rows. Corrected question revisions do not receive credit from obsolete offline answers.

## Phone app

Open the private HTTPS URL in Chrome (Android) or Safari (iPhone), then choose **Install app / Add to Home Screen**. This installable PWA is the initial mobile version. Native Android/iOS clients and file-picker transfer bundles are future work.

## CLI against the same server

```sh
recall --server https://recall.example.test:8445 decks --json
recall --server https://recall.example.test:8445 questions "Principles of Data Protection" --json
recall --server https://recall.example.test:8445 audit "Principles of Data Protection"
recall --server https://recall.example.test:8445 import bank.json --replace --dry-run --json
recall --server https://recall.example.test:8445 import bank.json --replace --json
```

Set `RECALL_SERVER_URL` in `.env` to avoid repeating the flag. `npm run local` then acts as a loopback proxy to that server, keeping the existing computer URL working. It leaves the old local PostgreSQL copy untouched. For a separate local installation, omit `RECALL_SERVER_URL` and configure `DATABASE_URL` instead.

## Hosting elsewhere

Use standard Docker Compose for independent PostgreSQL, or `compose.home.yaml` to connect to an existing private Docker PostgreSQL network. Set `RECALL_ENV_FILE` to an untracked env file containing `DATABASE_URL` and `RECALL_ALLOWED_ORIGINS`. Set `RECALL_POSTGRES_NETWORK` for the external network name.

```sh
RECALL_ENV_FILE=/srv/appdata/recall/.env docker compose -f compose.home.yaml up -d --build --wait
```

Bind the app to loopback behind HTTPS. Current hosting relies on private tailnet access and is single-user. Add authentication before public or multi-user hosting. The learning engine has no Tailscale dependency.

## Data migration and backup

Deck JSON export includes questions. A full PostgreSQL `pg_dump -Fc` includes progress, sessions, attempts and archived records too. Restore to an empty dedicated database with `pg_restore --no-owner --no-acl`, using a PostgreSQL client compatible with the dump. Keep a backup before migration or bulk replacement.

`deploy/backup-home.sh` dumps Recall, checks its archive, copies it to the backup drive and verifies SHA-256 after flushing. It refuses to write if the expected mount UUID is absent. `recall-backup.timer` runs daily. Deployment performs an actual restore into a disposable database before treating the first backup as verified. Backups of other home-server services and off-site copies are separate work.
