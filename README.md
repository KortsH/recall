# Recall

A focused exam learning tool. Import a quiz, learn through recognition and active recall, and share it as a file. Use it entirely on your own device, or connect to your own server. No account or subscription.

[Open the browser app](https://kortsh.github.io/recall/) · [Download for Windows](https://github.com/KortsH/recall/releases/download/v0.6.0-preview.1/Recall-Setup.exe) · [Download for Android](https://github.com/KortsH/recall/releases/download/v0.6.0-preview.1/Recall-Android.apk) · [Release details and checksums](https://github.com/KortsH/recall/releases/tag/v0.6.0-preview.1)

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

Before reloading or changing an active workspace, Android asks the page to save its current answer draft and finish local writes. If answers are waiting to sync, choose **Keep studying**, **Open recovery export**, or **Switch; keep pending**. Pending answers remain at the original server address; return to that exact address to sync them later. Opening a JSON attachment while studying uses the same check. An older page that cannot acknowledge saving requires a separate **Continue anyway** choice, with a warning that its current unsaved text may be lost. Physical-device checks are still on the preview roadmap.

### Browser, iPhone, macOS and Linux

Open [the browser app](https://kortsh.github.io/recall/). Import a file and start studying. All questions and progress stay in local browser storage; Recall does not upload your quiz to GitHub Pages. An initial visit downloads the application assets. Use your browser's install option, or Safari's **Add to Home Screen** on iPhone, for the PWA. Native iOS and native macOS/Linux installers are not available yet.

Each browser/profile, phone app and Windows app keeps its own workspace. Use portable files to transfer quizzes or your own progress between them. There is no automatic cross-device sync in device-only mode.

## Send a quiz to a friend

## Editing while disconnected

After downloading a shared-server quiz, you can edit questions, hints, flags and prerequisites, move topics or import questions without a connection. Changes queue on this device and upload with normal sync. If another device changed the same question, Settings shows both versions and asks which to keep; nothing is overwritten automatically. New questions and corrected learning content enter shared-server study after syncing, while published cards remain available offline. Device-only workspaces can study new content immediately. Export pending edits and review history in Settings for a personal backup; [CLI replay and conflict handling](docs/PORTABLE.md#pending-question-edits-and-conflicts) use the same validation.

## Interface languages

Use **Settings → Language** to choose **English** or **Eesti (Estonian)**. The choice applies immediately and is remembered on this device, including offline use. On first launch, a supported browser language is selected automatically. Questions, answers, topics and learning progress remain unchanged; you can import Estonian schoolwork and study it with an Estonian interface. Desktop, browser and Android share the same translation catalogs.

Want to contribute another language? Copy the English JSON catalog, translate its values and set the language's native name. Recall discovers it automatically in Settings. See the [translation guide](docs/TRANSLATING.md) for placeholders, plurals, Android behavior and checks. Application text belongs in these catalogs, while JSON field names, CLI commands and question IDs remain stable.

## Send a quiz to a friend

1. Open **Question library → Export** and leave **Include my learning progress** unchecked.
2. Save the `.recall.json` file and send it through Files, WhatsApp, email or any other channel you choose.
3. Your friend installs/opens Recall, chooses **Import**, reviews **Preview import**, then selects **Apply import**. They start with their own progress.
4. They can use **New question**, edit answers and dependencies, then export an updated copy to send back. Stable IDs prevent duplicate records. Missing questions remain unless you deliberately select **Replace this deck**.

To move your own learning between devices, export with **Include my learning progress** and select **Restore progress from this file** when importing into a device-only workspace. This explicitly replaces matching progress; it does not add counters twice. Server imports take questions only. File exchange is manual updating, not automatic conflict resolution for simultaneous edits. See [portable files and progress](docs/PORTABLE.md).

**Back up your files.** Clearing app/site data removes local quizzes and progress. A questions-only file does not contain your progress; export with progress when you want a personal backup.

## Make a quiz from your notes

Recall takes an ordinary JSON file. You can write it yourself, ask any chat assistant to create it, or give an agent with terminal access the CLI instructions below. **There is no AI service inside Recall:** generation happens in the tool you choose, then Recall validates and stores the result. You do not need an agent harness, API key or terminal to import a quiz.

### The question format

Save this example as `bank.json`, or use it as a template when prompting an assistant:

```json
{
  "schemaVersion": 1,
  "deck": "Queues practice",
  "description": "Definitions before applications",
  "questions": [
    {
      "id": "queue-fifo",
      "topic": "Queues",
      "concept": "FIFO ordering",
      "skill": "recall",
      "question": "What removal order defines a FIFO queue?",
      "answer": "First in, first out",
      "options": ["First in, first out", "Last in, first out", "Highest priority first", "Random order"],
      "correct": ["First in, first out"],
      "acceptedAnswers": ["First in, first out", "Oldest item first"],
      "hint": "Think about people waiting in a line.",
      "explanation": "The earliest item added is the earliest removed.",
      "difficulty": 1,
      "tags": ["definition"],
      "depends_on": []
    },
    {
      "id": "queue-first-removal",
      "topic": "Queues",
      "concept": "FIFO ordering",
      "skill": "application",
      "question": "A, then B, then C enter an empty FIFO queue. Which item leaves first?",
      "answer": "A",
      "acceptedAnswers": ["A"],
      "explanation": "A arrived earliest.",
      "difficulty": 2,
      "tags": ["scenario"],
      "depends_on": ["queue-fifo"]
    }
  ]
}
```

The minimum is `deck` plus `questions`, with an `id`, `question` and `answer` for every record. Keep IDs stable when revising a quiz. `topic` organizes the library; `depends_on` controls unlocking and requires **every** listed prerequisite. Difficulty runs from 1 to 5. An optional `hint` should suggest a starting point without revealing the answer.

One record is one learning objective: Recall can show it as choices, written recall and a flashcard, sharing progress across formats. Authored `options` provide better distractors; otherwise Learn reuses other bank answers for introductory recognition. `correct` contains exact option strings: one means single choice, several mean select-all. Use `acceptedAnswers` for short, exact aliases; for open prose omit it and let the learner compare with the model answer and self-assess. Use `requiredParts` for separately required short parts, or `variants` for alternate formats of the same objective. See the [authoring guide](docs/QUESTION_BANK.md) and [complete JSON Schema](docs/question-bank.schema.json).

### With a chat assistant, without terminal access

Paste your notes and the example above into your preferred assistant, then use this prompt:

> Turn these notes into a Recall JSON question bank using the supplied structure. Use only the source material; ask before guessing about ambiguous facts. Start with 15–25 useful objectives, with clear definitions, distinctions and short applications. Give each objective a stable, meaningful ID, topic, concept, skill (recall or application), question, answer, explanation and difficulty from 1–5. Use depends_on for foundations that must be learned first; include every referenced ID and avoid cycles. Avoid near-duplicate objectives: use variants for alternate formats. Add optional short hints that give a starting point without giving the answer away. Where useful, supply plausible but incorrect distractors and exact correct option strings. Use acceptedAnswers only for short, objectively checkable answers; leave open prose for model-answer self-assessment. Return valid JSON, without Markdown fences, suitable for saving as bank.json. For updates, preserve IDs, hints, flags and dependency links from my existing export unless we deliberately change them.

Open **Question library → Import**. Choose the saved JSON file, or paste the complete JSON into **Question bank JSON**. Choose **Preview import**, inspect the proposed changes, then **Apply import**. Matching IDs update existing questions rather than creating copies. Leave **Replace this deck** off when adding questions; turn it on only for a complete replacement bank. Replacement archives omitted cards rather than permanently deleting them. A missing prerequisite or a cycle prevents the import from applying.

For later revisions, export the current bank and give it back to the assistant alongside your new notes. Review its changes before importing. You can also use **New question**, edit a question directly, or **Flag & skip** a questionable card with a note for later review. No CLI is required for this workflow.

### With an agent harness or terminal

An agent harness is simply an assistant that can read files and run commands in your checkout. Give it your notes and this instruction:

> Read AGENTS.md and docs/QUESTION_BANK.md. Inspect the current bank, prerequisite status and coverage audit before making changes. Generate or revise a bank in the ignored private/ directory using stable IDs, keeping existing hints, review flags and dependencies. Validate it, preview the import and report additions, edits and proposed archives. Do not reset learning or generate redundant objectives. Use replacement only if I explicitly requested a complete replacement. Keep my material and connection settings out of Git.

The CLI requires a source checkout and `npm ci`; the Windows/Android downloads do not install a terminal CLI. **File-only commands work without PostgreSQL or a server:**

```sh
npm run recall -- validate private/bank.json
npm run recall -- pack private/bank.json -o private/quiz.recall.json
```

For a device-only workspace, import that resulting file through the UI. The CLI does not directly edit your browser's IndexedDB. For a configured PostgreSQL database or your own Recall server, use:

```sh
# Inspect before authoring. --silent makes JSON stdout suitable for scripts.
npm run --silent recall -- questions "My quiz" --json
npm run recall -- export "My quiz" -o private/current-bank.json
npm run recall -- audit "My quiz"
npm run recall -- prerequisites "My quiz"

# Add/update; omitted IDs remain.
npm run recall -- import private/bank.json --dry-run --json
npm run recall -- import private/bank.json --json

# Complete replacement: inspect proposed archives first.
npm run recall -- import private/bank.json --replace --dry-run --json
npm run recall -- import private/bank.json --replace --json

# Or target your own HTTP server explicitly; no direct database access needed.
npm run --silent recall -- --server https://recall.example.net questions "My quiz" --json
```

By default the CLI uses `RECALL_SERVER_URL` if configured, otherwise the local `DATABASE_URL`. Check the destination before writing. Use `--deck "My quiz"` on import when the JSON's deck name differs from the intended destination. Exporting questions keeps dependencies, hints and review notes; add `--portable` for a shareable `.recall.json` file, and `--progress` only when intentionally including personal learning data.

## Learn

Use the sun/moon button in the header to switch between light and dark mode. **Settings → Appearance** also offers **Follow system**. The preference stays on your device and does not change your questions or progress.

**Read question** and **Read model answer** use locally installed speech voices when the browser exposes them. Reading starts only when you click, and stops when you leave/change the card; model answers become readable after reveal or feedback. If no device voice is available, the control is unavailable. For speech-to-text today, focus the answer field and use your phone keyboard's microphone or your operating system's dictation. Recall does not yet request microphone access. Browser recognition needs additional compatibility and privacy handling: some browsers send audio to a remote service, whereas on-device recognition requires supported APIs and language packs. See the [native speech API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API).

- **Learn:** starts every new objective with multiple choice, then builds active recall in small working sets (12 by default). Master a set before the next unlocked questions enter. Saved sessions keep the same set. Enter checks written answers; Shift+Enter adds a line.
- **Cram:** ignores review dates. **Include locked questions** is an explicit prerequisite override.
- **Flashcards:** reveal, then self-assess Again / Hard / Good / Easy.
- **Test:** random questions, optional timer, answers withheld until the end. It also offers the explicit prerequisite override.

Three consecutive successes, including two active recalls, establish initial mastery. Recognition alone cannot. Mistakes reset the streak; successful recall schedules a later review. This simple model is not a claim of measured long-term retention.

`depends_on` lists all prerequisites a question requires. Learn unlocks dependent questions dynamically as foundations are mastered. A prerequisite becoming due does not relock its children; losing mastery can. Topic tabs organize material independently of prerequisites. Drag A onto B to make A depend on B, or drop onto a topic heading to move it. The editor's searchable prerequisite picker works on phones and with the keyboard.

Use **Something off? Edit question** after an answer. Semantic corrections reset that objective's progress; explanation, topic and dependency changes preserve it. Exact aliases and explicit multi-part grading are supported; prose uses a model answer and self-assessment. There is no AI grader or in-app generation service.

Optional hints appear on open recall cards when you request them. Hint use is recorded as assisted practice: a correct assisted answer does not increase the unaided streak or recall count, and cannot establish mastery or unlock prerequisites. Test mode offers no hints. Incorrect assisted answers still count as mistakes.

**Flag & skip** saves a review note and hides the question from all study modes. When it has follow-ups, review their prompts and answers before choosing whether to keep them locked or explicitly bypass this one flagged prerequisite. Other prerequisite requirements still apply. Removing the flag restores normal rules; flagging never marks a card mastered. Flags and notes are part of bank exports, so review them before sharing.

The library offers a topic list, two- and three-column grids, and a compact list. Layout and the uncategorized sidebar preference stay on your device. Filter by status, difficulty, hints or flags; select matching cards and move them together, or drag selected cards onto a topic heading. **Undo last change** reverses a move. Uncategorized cards use the existing `General` topic in JSON. The CLI can do the same organization in a single transaction:

```sh
npm run recall -- questions "My quiz" --flagged with --json
npm run recall -- questions "My quiz" --status locked --hints without --sort difficulty --json
npm run recall -- organize "My quiz" --ids queue-fifo,queue-first-removal --to "Queues"
npm run recall -- organize "My quiz" --from "Old topic" --to "New topic" --apply
npm run recall -- organize "My quiz" --unassigned --to "Foundations" --apply
npm run recall -- organize "My quiz" --ids queue-fifo --unassign --apply
npm run recall -- question-hint "My quiz" queue-fifo --set "Think about people waiting in a line."
npm run recall -- flag "My quiz" queue-fifo --note "Clarify the wording"
npm run recall -- flag "My quiz" queue-fifo --allow-dependents
npm run recall -- flag "My quiz" queue-fifo --clear
```

`organize` previews by default; `--apply` commits the whole batch atomically. `--file moves.json` accepts an array of `{ "id": "question-id", "topic": "Destination", "fromTopic": "Expected current topic" }` for several destinations at once. Moves, hints and flags preserve existing revisions and progress. To request a hint in scripted study, `hint <session-id> --file card.json` takes the current `{ "version": 0, "revision": 1 }`; interactive written study accepts `:hint`. See `npm run recall -- --help` for all commands.

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

Integration tests need a dedicated test PostgreSQL server with CREATEDB access. They create/drop uniquely named databases and never truncate the user's database. CI also builds and exercises the Windows installer. The [roadmap](docs/FUTURE.md) records optional follow-up and the personal-project scope; publisher signing and formal device certification are not required for these previews.

MIT licensed.

If a server outage leaves answers unsynced, Settings can export a private recovery file. The [recovery CLI instructions](docs/PORTABLE.md#recover-pending-server-answers) explain preview and safe replay.

To learn a deck from scratch, choose **Reset learning**, optionally download a progress backup, and confirm **Reset to zero**. This preserves the questions and resets only that deck's learning. Shared-server resets affect its connected devices; stale offline answers cannot restore the old progress. See [reset and recovery details](docs/PORTABLE.md#start-a-deck-again).

Use **Study controls** (the gear during a session, or Settings) to change single-choice auto-submit and the continuation key. Defaults are number/click to submit a single answer and Space to continue feedback. Multiple-answer questions have checkboxes and an explicit Enter/Check step. Preferences stay on the device; they do not change quiz grading or server progress.

**Settings → App updates** shows the installed UI version and can check for a web update. A downloaded update offers **Later** or **Save & reload**; it never reloads an active session automatically. Save & reload keeps the current typed/selected/matched answer draft, revealed self-assessment state and pending progress. **Save & leave** also preserves an unfinished answer. Drafts are separate for device/server workspaces and only resume on the same session, question, variant and revision. Application updates do not import questions or reset learning. For Windows/Android's bundled interface, install the new preview from the download links above; app files and study storage remain separate.

Learn also adds delayed memory checks of older mastered questions, at recall level rather than multiple choice. The session budget scales with deck size (about 5 checks for 30 questions, 20 for 100), excludes recent cards, flags and locked prerequisites, and remains bounded. A failed check removes mastery, returns that objective to relearning and increases checks of other older objectives. Selecting a check never changes its due date or grants mastery.

For written practice, **Answer in my head** (or Enter in an empty answer box) reveals the model without typing. Compare your mental response and explicitly choose Again, Hard, Good or Easy; revealing alone never earns credit. This is self-assessed recall, including for questions that also support automatic text checking. Test mode keeps answers hidden until completion. CLI/API users can send `mental: true` with the usual `version`, `revision` and `response` to `reveal`, then submit an explicit rating using the returned session version.
