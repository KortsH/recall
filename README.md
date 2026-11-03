# Recall

A free, open-source exam study tool. Start with multiple choice, build active recall, and share quizzes as files. Use it on your device without an account or subscription; connecting your own server is optional.

[Try the guided sample](https://kortsh.github.io/recall/#guide) · [Open Recall](https://kortsh.github.io/recall/) · [Windows download](https://github.com/KortsH/recall/releases/download/v0.9.0-preview.1/Recall-Setup.exe) · [Android download](https://github.com/KortsH/recall/releases/download/v0.9.0-preview.1/Recall-Android.apk) · [Release details](https://github.com/KortsH/recall/releases/tag/v0.9.0-preview.1)

## Start here — no coding required

1. **[Try the guided sample](https://kortsh.github.io/recall/#guide).** Start with three ordinary questions, then explore reversals, multiple answers, hints, matching, flashcards, prerequisites and defaults. Each example has an expandable explanation and **Show the JSON**. Skip between chapters freely. Practice stays inside the walkthrough, separate from your own decks and progress.
2. **Give your notes to your usual online chat assistant**, with the prompt below. No agent harness, terminal, API key or programming knowledge is needed.
3. **Paste its JSON into Recall:** **Question library → Import → Question bank JSON → Preview import → Apply import**. Saving a file first is optional.
4. **Check the answers and start Learn.** Correct a question after answering, ask for a hint, answer in your head, or dictate where supported.

The [complete sample bank](examples/walkthrough.json) is downloadable from the walkthrough. Import it to study it as a regular deck with saved progress. Sample questions are original English examples; interface/explanations support English and Estonian.

## Make a quiz from your notes

JSON is structured text. The assistant writes it; Recall validates it. Generation happens outside Recall in the assistant you choose. Recall contains no AI generator or AI grader. Review the facts against your notes: valid JSON can still contain a wrong answer.

Copy this prompt into an ordinary chat conversation and paste your notes beneath it:

```text
Turn my notes into a Recall question bank. Use only the source material;
ask about unclear facts instead of inventing answers. Return valid JSON
only, without Markdown fences. Start with 10–15 useful learning objectives.
Avoid repeated phrasings of the same objective.

A bank has a deck name and questions array. Each question needs a stable
id, question and answer. Add topic, concept, skill (recall or application),
explanation and difficulty (1–5) when useful.

Choose the checking method:
- acceptedAnswers lists complete aliases for a short exact answer.
- requiredParts lists separately required parts; each part is a list of
  aliases. All parts must be present.
- For open explanations, omit both and add an optional rubric. The learner
  compares with the model and grades themselves. Do not invent an AI grader.

Decide reversible:false or reversible:true for each question. True requires
reverse:{question,answer}, with its own optional acceptedAnswers,
requiredParts, rubric, explanation or hint. Write a clear reverse prompt,
not a mechanical swap of long sentences. Both directions share one id.

Optional features, only where useful:
- options and correct: plausible choices and exact correct option strings.
  One correct answer means single choice; several means select-all.
- hint: a cue that does not reveal the answer.
- depends_on: prerequisite ids in this bank. Every parent is required;
  include all referenced ids and avoid cycles.
- variants: alternate formats of the same objective. Types are written,
  flashcard, multiple_choice, multiple_select or matching. Matching uses
  pairs with unique left/right strings.
- tags: labels for organization.
- LaTeX: use $...$ inline or $$...$$ for display equations. Double each
  backslash in JSON. This renders math; it does not provide algebra grading.
- Optional image/answerImage: I will attach pictures in Recall's editor.
  Do not invent base64 data or put remote URLs in the bank.

Use the example and field reference below. Ordinary questions do not need
all optional features. For updates, use my exported bank, preserve its ids,
corrections, hints, flags and dependencies unless I request changes, and
explain proposed removals separately. Do not silently replace everything.
```

Also give the assistant this small, complete example:

```json
{
  "deck": "Everyday examples",
  "questions": [
    {
      "id": "minutes-001",
      "question": "How many minutes are in one hour?",
      "answer": "60 minutes",
      "acceptedAnswers": ["60", "60 minutes", "sixty minutes"],
      "reversible": false
    },
    {
      "id": "checklist-001",
      "question": "In your own words, what does a checklist help you do?",
      "answer": "Track the steps to do and notice any you have missed.",
      "rubric": ["Track the steps", "Notice omissions"],
      "reversible": false
    }
  ]
}
```

The first answer is checked against aliases. The second is open prose: compare your submitted answer with the model, then choose Again, Hard, Good or Easy. A rubric guides self-assessment; it does not score keywords automatically.

If import reports an error, give that message to the assistant and ask for a corrected **complete JSON object**. Do not paste fragments or an explanation around the JSON. Review question count, wording, answers and proposed archives in the import preview.

## How one question becomes several ways to learn

**Pictures and equations:** attach a picture in the question editor; exports embed it in the JSON so friends can import it offline without separate files or a server. LaTeX renders locally in prompts, answers and choices. Start with the [pictures/math example](examples/media-math.json) or read the [authoring guide](docs/MEDIA.md) for JSON escaping, image fields, CLI packing and grading rules. Blank Enter or **Alt+5** reveals an open question for mental self-assessment; bare **5** works outside text inputs.

One record is one learning objective, with a stable id and shared progress. Written recall and a flashcard exist automatically. Learn introduces new objectives with single-answer recognition, preferring authored single-choice options or using other bank answers for introductory choices, then moves to recall in small working sets. You do not need duplicate records for each format.

The guided sample lets you preview formats independently. Normal Learn still enforces working sets and prerequisites. Cram ignores review dates; Test hides model answers until completion. Tutorial practice is not a real attempt in your workspace.

### Reversible questions

```json
{
  "id": "fifo-001",
  "question": "What does FIFO stand for?",
  "answer": "First in, first out",
  "acceptedAnswers": ["First in, first out"],
  "reversible": true,
  "reverse": {
    "question": "Which abbreviation means first in, first out?",
    "answer": "FIFO",
    "acceptedAnswers": ["FIFO"]
  }
}
```

This is **one objective asked in both directions**. Mastery requires successful unaided recall each way plus the normal repeated-success threshold. A miss resets current successful recall evidence in both directions. Explicit reverse wording lets a definition ask for its term instead of requiring reproduction of the original question sentence. Scenarios often work better one-way.

### Multiple answers and required parts

```json
{
  "id": "even-001",
  "question": "Which two numbers are even: 1, 2, 3, 4?",
  "answer": "2; 4",
  "options": ["1", "2", "3", "4"],
  "correct": ["2", "4"],
  "requiredParts": [["2", "two"], ["4", "four"]]
}
```

Choice format uses checkboxes and Check: select every correct option and no wrong ones. Written format accepts `2; 4` or `four; two`, one part per semicolon/newline. All parts are required, order is flexible, and extra assertions fail. Use this for short formal rules; use self-assessment for paragraphs.

## Complete question-bank field reference

Optional fields can be omitted. Defaults describe behavior; they need not appear in every record. Unknown field names are rejected. Required text is nonempty. The [JSON Schema](docs/question-bank.schema.json) and [authoring guide](docs/QUESTION_BANK.md) add validation details; the importer also checks cross-field rules and the dependency graph.

### Whole-bank object

| Field | Required/default | Purpose |
| --- | --- | --- |
| `deck` | Required nonempty string | Quiz name; use the same destination for updates. |
| `questions` | Required array, 1–10,000 records | Objectives to import, each with a stable id. |
| `schemaVersion` | Optional; `1` | Format version; only 1 is supported. |
| `description` | Optional; empty string | Description shown with the deck. |
| `dependency_semantics` | Optional string | Descriptive compatibility metadata; it does not change the all-prerequisites-required rule. |

### Each question

| Field | Required/default | Effect and when to use it |
| --- | --- | --- |
| `id` | Required stable string | Identifies the objective for updates, progress and prerequisites. Use 1–120 letters/digits/dots/underscores/hyphens, starting with a letter/digit. Keep it stable. |
| `question` | Required string | Forward prompt. |
| `answer` | Required string | Forward model answer shown after answering/revealing. |
| `image` | Optional; no picture | Prompt image object with required src (embedded PNG/JPEG/WebP data URL) and alt description; optional caption. Use the editor to attach/resize a picture, or CLI pack to embed a relative file. |
| `answerImage` | Optional; no picture | Same image structure, shown with the model after reveal/feedback. Never included in the unanswered card. |
| `topic` | Optional; `"General"` | Groups the library; does not create dependencies. |
| `concept` | Optional; question text | Connects related objectives for separation in practice. |
| `skill` | Optional; `"recall"` | `"recall"` or `"application"`; labels skill/results, without imposing a content ratio. |
| `explanation` | Optional; empty string | Explains why the answer is right. Explanation-only changes preserve mastery. |
| `difficulty` | Optional; `1` | Author's integer 1–5 label/filter, not grading strictness or an unlock threshold. |
| `tags` | Optional; `[]` | String labels for organization/review. |
| `options` | Optional; 2–12 unique strings | Authored choice answers. Without them, Learn can build introductory choices from other answers. |
| `correct` | Optional; `[answer]` when options exist | Exact strings from `options`, never indexes. One means single choice; several means select-all. Requires options; if omitted, answer must exactly match its correct option. |
| `acceptedAnswers` | Optional nonempty string list | Complete short-answer aliases; normalizes case, spacing and limited punctuation, without inferring arbitrary paraphrases. |
| `requiredParts` | Optional list of alias lists | All separately required short parts. Takes precedence over acceptedAnswers if both are supplied; prefer one checking method. |
| `rubric` | Optional string list | Points for self-assessment; does not automatically grade prose. |
| `hint` | Optional nonempty string | Requested cue on written/flashcards. Assisted success does not increase unaided mastery/unlock dependents. Test has no hints. |
| `depends_on` | Optional; no prerequisites | Ids in this deck; **every** listed parent must be mastered. Missing ids, self-links and cycles fail validation. Review dates are separate. |
| `reversible` | Optional; one-way behavior | Boolean; true requires authored reverse content. Absent/false stays one-way; adding false alone preserves hashes. |
| `reverse` | Required only with reversible:true | Reverse prompt and its own checking rules; see below. Not allowed when reversible is absent/false. |
| `variants` | Optional; `[]` | Additional authored formats of this objective; see below. |
| `flag` | Optional; no flag | Review object with required `note` and optional `allowDependents` (default false). Hides the card in all modes; true explicitly waives this flagged parent only, without awarding mastery or waiving other parents. Usually omit in newly generated banks. |
| `type` | Optional legacy field | Top-level written/flashcard/multiple_choice/multiple_select remain accepted for compatibility, but do not restrict an objective to one format. New banks should use content fields and variants. |

Exact checking preserves negation, signs and mathematical directions. With neither aliases nor required parts, written answers use model comparison and explicit self-assessment. **Answer in my head** permits comparison without typing; supported browser dictation writes into the same editable answer box.

### The reverse object

Required: `question`, `answer`. Optional: its own `image`, `answerImage`, `acceptedAnswers`, `requiredParts`, `rubric`, `explanation`, `hint`, with the meanings above. Forward images/hints/rubrics are not reused. There is no separate reverse id, topic, difficulty, dependency list or progress record. Reverse choice/matching prompts belong in appropriate authored variants, not unsupported reverse fields.

### Objects inside variants

Each requires `id`, `type`, `question`, `answer`. Optional common fields: `image`, `answerImage`, `explanation`, `hint`, `skill`, `rubric`. Skill inherits the objective's skill when omitted. Explicit hints override the objective hint; ordinary variant feedback can use the objective explanation/rubric as fallback.

| Type | Additional fields and behavior |
| --- | --- |
| `written` | Optional acceptedAnswers or requiredParts; with neither, self-assess. |
| `flashcard` | Reveal and self-assess; no extra fields needed. |
| `multiple_choice` | Required options; optional correct with exactly one answer, default `[answer]`. |
| `multiple_select` | Required options; correct lists all correct strings, default `[answer]` if omitted. |
| `matching` | Required pairs: 2–12 objects with nonempty left/right strings, unique on both sides. Every pair must match. Answer is the human-readable model mapping. |

Use distinct short variant ids. `choice`, `written`, `flashcard`, `learn-choice` are reserved for automatic formats; reversible objectives also reserve `reverse`, `reverse-flashcard`. Adding a variant does not guarantee a particular Learn step; Learn selects a recognition/recall progression, and reversible objectives use their forward/reverse recall path.

Example inside a question's variants array:

```json
{
  "id": "match-actions",
  "type": "matching",
  "question": "Match each action to its meaning.",
  "answer": "Save → Keep changes; Undo → Reverse the last change",
  "pairs": [
    {"left": "Save", "right": "Keep changes"},
    {"left": "Undo", "right": "Reverse the last change"}
  ]
}
```

### Exported .recall.json files

Portable exports wrap the same bank in `{ "format": "recall", "version": 1, "bank": { ... } }`, with optional `createdAt` and an optional app-generated `progress` map. An assistant creating questions should return an ordinary bank, not fabricate progress, hashes or review history. Default exports share questions only. For your own device transfer, explicitly export and restore progress. Device-only workspaces do not synchronize automatically.

## Revise a quiz without starting over

Export your current quiz, give it to the assistant with the requested changes, and preserve ids, corrections, hints, flags and dependencies. Import normally updates/adds by id and keeps omitted cards. **Replace this deck** explicitly archives omitted cards; inspect the preview first. Archive is not permanent deletion.

Unchanged questions retain progress. Changing prompts, answers, grading or reverse content resets that objective through a semantic revision. Topic, concept, difficulty, tags, explanations, hints and dependency-only changes preserve grading revisions. Edit in the library or after answering; flag doubtful material with a review note.

---

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


## Learn

Use the sun/moon button in the header to switch between light and dark mode. **Settings → Appearance** also offers **Follow system**. The preference stays on your device and does not change your questions or progress.

**Read question** and **Read model answer** use locally installed speech voices when the browser exposes them. Reading starts only when you click, and stops when you leave/change the card; model answers become readable after reveal or feedback. If no device voice is available, the control is unavailable. For written answers, **Dictate answer** uses the browser's built-in speech recognition where available. It starts only when clicked, defaults to on-device processing, and writes directly into the editable answer box. Take as long as you need: capture stays active through thinking pauses, restarting the browser recognizer when necessary. Click **Stop dictation**, or press **Enter** to stop and submit/compare the current answer in one action. There is no transcript preview or insertion step. Voice options closes when dictation starts. Voice options selects the spoken language separately from the interface. If an on-device language pack/API is unavailable, Recall never silently switches online. You may explicitly enable the browser's speech service; the displayed notice explains that audio may go to the browser provider and need internet. Recall adds no transcription server, API key, audio storage or audio-upload endpoint. Recognition stops on card changes, submission/reveal, navigation and when the app is hidden. Unsupported browsers and embedded WebViews keep typing and OS/keyboard dictation available. Dictated text follows normal answer-draft storage. Typing/editing manually stops recognition so later results cannot overwrite your edits. Uninserted previews from the previous version are recovered into the same card's answer box without grading. Recognition quality and language support depend on your browser/device; review technical terms and punctuation before submitting. See the [native speech API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API).

- **Learn:** starts every new objective with multiple choice, then builds active recall in small working sets (12 by default). Master a set before the next unlocked questions enter. Saved sessions keep the same set. Enter checks written answers; Shift+Enter adds a line.
- **Cram:** ignores review dates. **Include locked questions** is an explicit prerequisite override.
- **Flashcards:** reveal, then self-assess Again / Hard / Good / Easy.
- **Test:** random questions, optional timer, answers withheld until the end. It also offers the explicit prerequisite override.

Three consecutive successes, including two active recalls, establish initial mastery. Recognition alone cannot. Mistakes reset the streak; successful recall schedules a later review. This simple model is not a claim of measured long-term retention.

`depends_on` lists all prerequisites a question requires. Learn unlocks dependent questions dynamically as foundations are mastered. A prerequisite becoming due does not relock its children; losing mastery can. Topic tabs organize material independently of prerequisites. Drag A onto B to make A depend on B, or drop onto a topic heading to move it. The editor's searchable prerequisite picker works on phones and with the keyboard.

Use **Something off? Edit question** after an answer. Semantic corrections reset that objective's progress; explanation, topic and dependency changes preserve it. Exact aliases and explicit multi-part grading are supported; prose uses a model answer and self-assessment. There is no AI grader or in-app generation service.

Correct answers show the model once. Incorrect answers show your response beside the model; when a wrong choice is another card's exact answer, feedback also names that card's question so you can see the distinction. Unknown distractors get no invented connection. **Answer in my head** shows only the model for self-assessment. Long answers expand naturally instead of scrolling inside a small answer box. These displays also work offline and in session review; Test keeps feedback hidden until you finish.

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

Update discovery runs when Recall opens, comes back into the foreground or reconnects, and listens for the browser's update-ready event. There is **no polling timer**. Focus/visibility bursts share a check, with a five-minute automatic-check cooldown; reconnection and the manual Settings check can retry sooner. **Later** collapses the notice to a small reminder. The notification is also visible in the guided sample. The website offers **Save & reload** once the new build is ready; Windows/Android offer **View download** when a newer published installer is available. Installation remains your choice.

Bundled apps read a small public release file hosted with the website, with no credentials, referrer, quiz content or learning progress. GitHub Actions rebuilds that file on a push or published release; clients do not use the rate-limited GitHub API. Preview installations can receive newer previews; stable installations wait for stable releases. A release needs the relevant installer and checksum file before Recall advertises it. Android reports its installed app version even when displaying a newer server interface. Offline checks leave the current app working; retry from Settings. GitHub Pages does not provide push notifications: a continuously open, focused tab discovers changes on its next lifecycle/manual check, rather than receiving an immediate background push. No notification permission or separate push server is required.

Learn also adds delayed memory checks of older mastered questions, at recall level rather than multiple choice. The session budget scales with deck size (about 5 checks for 30 questions, 20 for 100), excludes recent cards, flags and locked prerequisites, and remains bounded. A failed check removes mastery, returns that objective to relearning and increases checks of other older objectives. Selecting a check never changes its due date or grants mastery.

For written practice, **Answer in my head** (or Enter in an empty answer box) reveals the model without typing. Compare your mental response and explicitly choose Again, Hard, Good or Easy; revealing alone never earns credit. This is self-assessed recall, including for questions that also support automatic text checking. Test mode keeps answers hidden until completion. CLI/API users can send `mental: true` with the usual `version`, `revision` and `response` to `reveal`, then submit an explicit rating using the returned session version.

Two-way recall is optional per question: `reversible: true` requires an authored `reverse` object with `question` and `answer`, plus optional aliases/parts/rubric/explanation/hint. See [examples/reversible.json](examples/reversible.json) and the [authoring guide](docs/QUESTION_BANK.md#two-way-recall). The question editor exposes the same fields. Both directions share an ID and progress; reversible mastery requires successful unaided recall each way. Old banks remain compatible. Enabling/changing reverse content resets only the edited objective's learning through normal semantic-revision rules. Feedback now shows your submitted answer alongside the model; mental recall is labeled honestly without inventing text.

### Optional: with an agent harness or terminal

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
