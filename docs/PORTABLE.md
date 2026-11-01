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
