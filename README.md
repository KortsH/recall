# Recall

A focused exam learning tool. Import a quiz, learn through recognition and active recall, and share it as a file. Use it entirely on your own device, or connect to your own server. No account or subscription.

[Open the browser app](https://kortsh.github.io/recall/) · [Download for Windows](https://github.com/KortsH/recall/releases/download/v0.2.1-preview.1/Recall-Setup.exe) · [Download for Android](https://github.com/KortsH/recall/releases/download/v0.2.1-preview.1/Recall-Android.apk) · [Release details and checksums](https://github.com/KortsH/recall/releases/tag/v0.2.1-preview.1)

## Install and use

The current release is a preview. Device-only study requires **no Node.js, PostgreSQL, Docker, account or home server**. Android includes the study interface in the APK; the browser app needs an initial online visit before offline use.

### Windows

1. Download **Recall-Setup.exe** above and run it. This is an unsigned preview executable; the publisher is not yet code-signed.
2. Setup installs for your Windows user and adds **Recall** to the Start menu, then opens the app in your default browser. No administrator installation or database setup is needed on supported Windows 10/11 systems with .NET Framework 4.8.
3. Choose **Import**, select a quiz JSON file, review the preview, then **Apply import**.
4. Reopen **Recall** from the Start menu whenever you want. Its tray menu has **Open Recall** and **Quit Recall**.

The app binds only to `http://127.0.0.1:4312/`. Questions and progress live in that browser profile's local storage. Keep using the same browser/profile, and export backups before clearing site data. Setup/update preserves the local address and does not erase browser storage. If port 4312 is in use, close the conflicting app; it will not silently switch ports and make your progress appear missing.

Prefer cloning? Run one command from the checkout:

```powershell
.\setup.cmd
```

This downloads the versioned release installer, verifies its SHA-256 checksum, and runs it. It does not require a development environment. The PowerShell execution-policy setting applies only to this setup process, not your machine's policy. To remove Recall, quit its tray app, remove its Start-menu shortcut and `%LOCALAPPDATA%\RecallPersonal` installation folder. This leaves browser learning data alone; export it before separately clearing that site data.

### Android

1. Download **Recall-Android.apk** above on your phone and open it. Android may ask you to allow installation from the browser or Files app you used. This is a preview APK, not a Play Store release.
2. Open Recall and choose **Use without a server**. No VPN or server address is needed.
3. Choose **Import**, pick the `.recall.json` or ordinary question-bank JSON file you received, review the preview and choose **Apply import**.
4. Study, add/edit questions and organize prerequisites offline. **Export → Save quiz file** opens Android's save-file picker. Share that saved file through your preferred app.

You can also choose **Open with Recall** for a JSON attachment when the sending app supplies a supported content URI. Importing still shows a preview. Keep Android System WebView updated for native file export. The APK contains no private server address, database credentials or SSH keys. Optional **Workspace options → Connect to server** accepts your own HTTPS origin; a private server may require your VPN. Device and server workspaces remain separate.

### Browser, iPhone, macOS and Linux

Open [the browser app](https://kortsh.github.io/recall/). Import a file and start studying. All questions and progress stay in local browser storage; Recall does not upload your quiz to GitHub Pages. An initial visit downloads the application assets. Use your browser's install option, or Safari's **Add to Home Screen** on iPhone, for the PWA. Native iOS and native macOS/Linux installers are not available yet.

Each browser/profile, phone app and Windows app keeps its own workspace. Use portable files to transfer quizzes or your own progress between them. There is no automatic cross-device sync in device-only mode.

## Send a quiz to a friend

1. Open **Question library → Export** and leave **Include my learning progress** unchecked.
2. Save the `.recall.json` file and send it through Files, WhatsApp, email or any other channel you choose.
3. Your friend installs/opens Recall, chooses **Import**, reviews **Preview import**, then selects **Apply import**. They start with their own progress.
4. They can use **New question**, edit answers and dependencies, then export an updated copy to send back. Stable IDs prevent duplicate records. Missing questions remain unless you deliberately select **Replace this deck**.

To move your own learning between devices, export with **Include my learning progress** and select **Restore progress from this file** when importing into a device-only workspace. This explicitly replaces matching progress; it does not add counters twice. Server imports take questions only. File exchange is manual updating, not automatic conflict resolution for simultaneous edits. See [portable files and progress](docs/PORTABLE.md).

**Back up your files.** Clearing app/site data removes local quizzes and progress. A questions-only file does not contain your progress; export with progress when you want a personal backup.

## Learn

- **Learn:** prioritizes weak/unseen objectives and moves from recognition to recall, with interleaved retries.
- **Cram:** ignores review dates. **Include locked questions** is an explicit prerequisite override.
- **Flashcards:** reveal, then self-assess Again / Hard / Good / Easy.
- **Test:** random questions, optional timer, answers withheld until the end. It also offers the explicit prerequisite override.

Three consecutive successes, including two active recalls, establish initial mastery. Recognition alone cannot. Mistakes reset the streak; successful recall schedules a later review. This simple model is not a claim of measured long-term retention.

`depends_on` lists all prerequisites a question requires. Learn unlocks dependent questions dynamically as foundations are mastered. A prerequisite becoming due does not relock its children; losing mastery can. Topic tabs organize material independently of prerequisites. Drag A onto B to make A depend on B, or drop onto a topic heading to move it. The editor's searchable prerequisite picker works on phones and with the keyboard.

Use **Something off? Edit question** after an answer. Semantic corrections reset that objective's progress; explanation, topic and dependency changes preserve it. Exact aliases and explicit multi-part grading are supported; prose uses a model answer and self-assessment. There is no AI grader or in-app generation service.

## Optional shared server

For your own computer/phone to share a database automatically, run the Node + PostgreSQL server privately. Connected clients can download complete quizzes, study without per-answer requests, and sync progress in batches. Settings → **Sync progress & refresh quizzes** picks up updates explicitly.

Read [hosting instructions](docs/HOSTING.md) and [security boundaries](SECURITY.md). This is currently a single-user service without an application login. Do not expose it publicly or grant untrusted users network access without adding authentication. A mobile install never grants access to someone else's server or runs database migrations. No deployment address is compiled into public artifacts.

## Development and building from source

These tools are for contributors/self-hosters; they are not required for the downloads above. Use Node 22.12+ (24 recommended), npm, and PostgreSQL 17+ or Docker for server development.

```sh
npm ci
# Copy .env.example to .env and configure your own database.
docker compose up -d db
npm run seed
npm run dev
```

Open `http://127.0.0.1:5173`. The seed is a synthetic four-question demo; it never runs automatically. `npm run build && npm start` serves the built server app at `http://127.0.0.1:4310`. Alternatively, `docker compose up --build -d` runs the app and PostgreSQL together; `docker compose exec app npm run seed` imports the demo. Stop with `docker compose down`; the database volume remains. Default Docker credentials are for local development only.

```sh
# Device-only static browser build; serve build/standalone over localhost or HTTPS.
npm run build:standalone

# Android (JDK 17+, Android SDK 35; npm ci first).
cd mobile/android
./gradlew testDebugUnitTest assembleDebug
```

Build the Windows installer from PowerShell with `./desktop/windows/build.ps1`, then run `npm run test:installer`. It uses Windows' .NET Framework compiler and bundles the static UI. [Mobile source/build details](mobile/README.md).

### CLI and agent authoring

```sh
# File-only commands require no server/database connection.
npm run recall -- pack bank.json -o quiz.recall.json
npm run recall -- bundle-inspect quiz.recall.json
npm run recall -- validate quiz.recall.json

# Commands against your configured PostgreSQL database or --server URL.
npm run recall -- import bank.json --replace --dry-run --json
npm run recall -- import bank.json --replace --json
npm run recall -- questions "My quiz" --json
npm run recall -- prerequisites "My quiz"
npm run recall -- audit "My quiz"
npm run recall -- export "My quiz" --portable -o quiz.recall.json
npm run recall -- export "My quiz" --portable --progress -o my-progress.recall.json
```

Use stable IDs and preserve dependencies. Formats of one objective share progress; recall and application can be separate objectives. CSV/TSV imports are also supported by the CLI. Read [question authoring](docs/QUESTION_BANK.md), [JSON Schema](docs/question-bank.schema.json), [portable format](docs/PORTABLE.md) and [agent instructions](AGENTS.md). Real course documents, private banks, settings, signing keys and backups stay outside Git.

### Verify

```sh
npm test                    # Engine, file exchange, device-only storage and UI components
npm run test:integration     # Disposable real PostgreSQL database, HTTP and CLI
npm run build               # TypeScript and server frontend
npm run build:standalone    # Device-only frontend
npm run check               # Public-source guard + unit/integration tests + build
npm run test:installer      # Windows only; build installer first
```

Integration tests need a dedicated test PostgreSQL server with CREATEDB access. They create/drop uniquely named databases and never truncate the user's database. CI also builds and exercises the Windows installer. Physical phone testing, release signing and other remaining work are in [the roadmap](docs/FUTURE.md).

MIT licensed.

If a server outage leaves answers unsynced, Settings can export a private recovery file. The [recovery CLI instructions](docs/PORTABLE.md#recover-pending-server-answers) explain preview and safe replay.
