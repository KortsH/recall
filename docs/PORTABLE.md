# Portable quizzes and device-only study

The same `.recall.json` file imports into the Windows app, Android app, browser/PWA and server-backed web app. Plain question-bank JSON remains supported. Files contain declarative questions, not executable templates.

## Sharing with a friend

1. In Question library, choose **Export**. Leave **Include my learning progress** unchecked and save the quiz file.
2. Send the file through Files, WhatsApp, email or any other channel you choose. Recall does not integrate with or send messages through those services.
3. Your friend opens Recall, chooses **Import**, selects the file, checks **Preview import**, then chooses **Apply import**. They can study and edit in a device-only workspace without an account or server.
4. They can use **New question**, edit existing questions and prerequisites, and export an updated file to send back.
5. Importing by stable ID updates existing questions and adds new IDs. Omitted questions remain unless **Replace this deck** is selected; replacement archives them. Changed question content resets only that objective's progress. Metadata/dependency changes preserve it.

The preview reports additions, updates, archives and progress resets before anything is written. A file cannot partly apply if its graph is invalid. Question IDs are scoped to a deck name. Keep the deck name and existing IDs when exchanging updates; changing a deck name imports a separate quiz.

File exchange is a manual update workflow, not live collaborative editing or a three-way merge. If two people change the same questions independently, review which version should win before importing. Recognition, recall and application formats and prerequisite links travel with the quiz.

## Moving your own progress

Export with **Include my learning progress**, then import on the other device and select **Restore progress from this file**. This explicitly replaces progress for matching incoming questions; it does not add counters from two copies. The default keeps the destination's existing progress, and newly imported questions start fresh.

Progress is tied to a SHA-256 hash of the question's semantic content. Incompatible progress is rejected when restoring. Explanation, topic, concept, difficulty, tags and prerequisite-only changes do not change this hash. Corrected answer/grading content does. Re-importing the same progress file cannot inflate attempts. The file contains progress counters/dates, not saved typed responses or session history.

Progress restore is currently supported in device-only workspaces. A server import accepts the questions from the same file; server progress remains in PostgreSQL. For a complete server migration, use a PostgreSQL backup. These are distinct operations.

Device-only storage is IndexedDB, isolated from the downloaded server workspace. It makes no quiz API requests, including on first launch, import, editing or study. Browser profiles, the public browser app, the local Windows address and Android are separate workspaces. Files transfer quizzes/progress between them. Clearing app/site data removes local learning data, so keep exported backups.

## Format

```json
{
  "format": "recall",
  "version": 1,
  "createdAt": "2026-11-01T00:00:00.000Z",
  "bank": {
    "schemaVersion": 1,
    "deck": "My quiz",
    "description": "A portable quiz",
    "questions": [
      { "id": "definition", "question": "What does FIFO mean?", "answer": "First in, first out" },
      { "id": "application", "question": "A then B enter a FIFO queue. Which leaves first?", "answer": "A", "depends_on": ["definition"] }
    ]
  }
}
```

Optional `progress` maps question IDs to `{ hash, progress }`. Use the application's exporter to produce it. Progress is schema-validated and matched to the incoming questions when explicitly restoring. Connection URLs, database credentials, SSH material and server configuration have no place in the format. Imports and exports have a 5 MB limit in the UI/native file picker.

## CLI

```sh
# File-only operations: no database or server connection.
npm run recall -- pack bank.json -o quiz.recall.json
npm run recall -- bundle-inspect quiz.recall.json
npm run recall -- validate quiz.recall.json

# Export from a configured server/database.
npm run recall -- export "My quiz" --portable -o quiz.recall.json
npm run recall -- export "My quiz" --portable --progress -o my-progress.recall.json

# Server imports take questions from a portable file, preserving existing server progress.
npm run recall -- import quiz.recall.json --dry-run --json
npm run recall -- import quiz.recall.json --json
```

For agent authoring, read `QUESTION_BANK.md` and inspect the existing bank first. Preserve IDs and `depends_on`. Share self-contained banks so all prerequisites exist in the recipient's file. Partial server imports may refer to existing records, but a friend cannot learn a missing prerequisite.

## Recover pending server answers

In a downloaded server workspace, open **Settings → Export unsynced progress** if a prolonged outage prevents sync. Export works offline, leaves the outbox intact and produces a private `*.recovery.json` file containing pending sessions, typed answers and the downloaded questions. Keep it as a personal backup; use the normal quiz export for sharing.

```sh
# Validate and inspect without any connection.
npm run recall -- recovery-inspect Recall-pending-progress.recovery.json

# Preview against the intended original server (or configured DATABASE_URL).
npm run recall -- --server https://your-server.example recover Recall-pending-progress.recovery.json
# Replay only after reviewing the destination and preview.
npm run recall -- --server https://your-server.example recover Recall-pending-progress.recovery.json --apply
```

Recovery never imports questions or changes connection settings. The destination must already contain the original deck IDs. Each answer is regraded against the server's current revision; evidence for corrected/archived questions is retained but excluded from mastery. Replaying the same evidence cannot add duplicate credit. Conflicting or newer server evidence stops recovery, reporting completed sessions; the original file remains unchanged. Ordinary sync is also safe after successful recovery. Keep the file and outbox until the destination has been verified.

Device-only workspaces use **Export with my progress** instead. Recovery files are a separate format and are intentionally rejected by ordinary quiz import.

## Pending question edits and conflicts

In a downloaded server workspace, edits and imports work without a connection. Each saved action stores an immutable batch containing stable question IDs, the downloaded original, and the desired full question (including hints, flags and dependencies). Topic moves and replacements use the same queue. Replacements archive omitted questions. Newly created decks keep their local stable deck ID when published; a conflicting server deck name requires a new name or an explicit discard, never an automatic merge.

Sync happens with normal progress sync, including finish/Save & leave and explicit refresh. Every batch is checked against the current server bank before any writes. Conflicts in Settings show the original, local and server versions, including changed metadata. Choose for each conflict, save choices, then sync again. A newer intervening server change requires another review. Dependency graphs are validated against the complete prospective active bank. Choosing a version alone makes no network request.

New questions and semantic corrections wait for an acknowledged server revision before entering server-backed study. They stay editable and shareable in the library. Metadata-only changes preserve progress; semantic corrections reset the affected objective when published. A server receipt makes interrupted uploads idempotent. Pending answers remain separate and are regraded normally after edit publication; obsolete content never gains mastery.

**Settings → Offline question edits → Export pending edits and review history** creates a personal `.edits.json` backup without uploading or clearing anything. It contains pending before/after versions and resolved-conflict history; normal quiz export remains the format for sharing the current bank. Keep pending study answers using the separate recovery export too. Both files omit connection configuration.

```sh
# File-only validation/inspection.
npm run recall -- edits-inspect Recall-pending.edits.json
# Preview the next unapplied batch; no writes. Later batches depend on earlier ones.
npm run recall -- --server https://recall.example.test edits-replay Recall-pending.edits.json
# Apply in order, stop at the first conflict, and report completed batch IDs.
npm run recall -- --server https://recall.example.test edits-replay Recall-pending.edits.json --apply
```

Replay never rewrites the file. Repeating it uses server receipts instead of duplicating edits or resetting progress again. The destination must be the intended original server; stable deck IDs are not remapped to similarly named decks. Agents can inspect reported `base`, `local`, and `server` values and produce an explicitly reviewed replacement batch with a new request UUID. Reusing a request ID with different content is rejected. JSON field names stay English protocol identifiers. The core parser and `/api/authoring?dryRun=1` use the same validation as the UI.

## Start a deck again

Choose **Reset learning** below the study controls or in the study session. The confirmation names the selected deck and offers a progress-file backup. **Reset to zero** clears that deck's mastery, counters and review dates and ends its saved sessions. Questions, IDs, revisions and prerequisites remain unchanged; Learn starts at recognition again. Other decks are unaffected. Reset is available offline in a device-only workspace; a shared-server reset requires a connection and applies to that shared deck on every device.

```sh
# Preview only; no learning data changes.
npm run recall -- reset-learning "My quiz"
# Apply explicitly against the intended configured server/database.
npm run recall -- reset-learning "My quiz" --apply
```

Historical server attempt evidence is retained and marked invalid. A per-deck learning generation prevents pre-reset sessions and offline recovery files from restoring progress. Other downloaded clients must reload the reset deck using the current app. If old pending answers block sync, Settings offers **Export unsynced progress**, then **Discard outdated answers & reload decks**. The discard action verifies a newer server generation and affects only those outdated decks; pending work for other decks stays local.

A portable progress backup can be restored explicitly in a device-only workspace. Full server rollback uses the owner's PostgreSQL backup. Downloading a backup or previewing a reset does not perform the reset.

## Study controls and keyboard flow

Open the gear beside **Save & leave**, or **Settings → Study controls**. Preferences are remembered on this device.

- Single-answer questions use action buttons and submit immediately by default. Number keys choose the corresponding answer; arrow keys move focus. Turn off immediate submission to use radio selection followed by Check/Enter.
- Multiple-answer questions use checkboxes with number-key hints. Select/toggle all intended answers, then press Enter or Check.
- After correct or incorrect feedback, Space continues by default. Choose another continuation key, Any key, or Button only. Tab, Escape, modifier shortcuts, held-key repeats and IME composition are excluded from global continuation. Text answers still use Enter to compare/check, Shift+Enter for a newline and 1–4 to self-grade.
- Number-key selection moves keyboard focus to the selected answer, so a separate first-answer focus ring does not remain behind.

Study layout uses a compact header, a wider responsive reading area and larger question/answer typography. It has been checked at desktop, zoom-equivalent, 4K and phone sizes without changing dashboard/library layout.

Initial choice focus is neutral: no answer is visually preselected. After a typed open answer is revealed, focus goes to the model-answer content, rather than pre-focusing Good. Press 1–4 or explicitly choose a self-rating; Enter alone does not choose a rating. Input focus returns automatically for the next written recall.
