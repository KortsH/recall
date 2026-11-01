# Working on Recall

Recall is a small, single-user study tool, usable in a device-only workspace or through a private server. Prioritise a smooth study loop and correct progress over infrastructure. No in-app AI, PDF ingestion, cloud accounts, or paid APIs. Android bundles the study UI; Windows has a per-user installer. Read `docs/PORTABLE.md` for file sharing and `docs/FUTURE.md` for remaining work.

## Where things live

- `src/core/types.ts`: question/variant, progress, session and attempt types.
- `src/core/bank.ts`: canonical validation, file import, generated formats, semantic hashing.
- `src/core/schema.ts` and `portable.ts`: browser-safe bank validation, semantic representation and portable quiz/progress files. Node hashing must stay identical to the browser digest; metadata-only changes must not invalidate progress.
- `src/core/engine.ts`: pure grading, scheduling, topic interleaving, retry selection.
- `src/core/questions.ts` and `study.ts`: browser-safe format projection, session transitions and results shared by downloaded and server study.
- `src/web/cache.ts`: whole-bank IndexedDB downloads, local sessions and batched sync. Do not add per-answer network requests in downloaded mode.
- `src/server/offline.ts`: revalidates uploaded evidence; session/ordinal identity prevents duplicate credit.
- `src/server/store.ts`: shared application services, PostgreSQL transactions and sessions.
- `src/server/http.ts`: plain Node HTTP adapter and built frontend serving.
- `src/cli.ts`: interactive and scriptable CLI using the same services.
- `src/web/`: React UI. Keep grading and mastery logic out of it.
- `examples/demo.json`: synthetic format and prerequisite examples.

## Generate/import questions

1. Read `docs/QUESTION_BANK.md` and `docs/question-bank.schema.json`.
   Inspect `recall questions <deck> --json`, `recall audit <deck>`, and the current export before generating additions. Check `RECALL_SERVER_URL` so work reaches the intended shared database.
2. Use stable, meaningful IDs and explicit correct answers, explanations and aliases. Do not infer permissions from policy constraints. Identify Biba/watermark variants precisely.
3. One question record is one learning objective. Its automatic choice/written/flashcard formats and explicit variants share progress. Distinct objectives should have distinct IDs.
4. Generate JSON externally. Run `npm run recall -- validate path.json`, then `npm run --silent recall -- import path.json --json` (the silent npm wrapper keeps stdout machine-readable).
5. Inspect counts and errors. Preserve existing IDs when correcting a bank. Export a deck before bulk editing if needed. Import does not remove absent IDs.
   For replacement, run `import file.json --replace --dry-run --json`, inspect `archiveIds`, then repeat without `--dry-run`. `--topic MAC` scopes replacement; every incoming question must belong to that topic. Omitted records are archived, not purged; `archive` and `restore` provide individual control.
   Set `concept` and `skill` (`recall`/`application`) explicitly. Several formats of one objective belong in variants; recall versus applying a concept can be separate objectives. Aim for roughly 40/60 in later banks, without padding the foundation deck. Audits are review hints, not automatic semantic deduplication.
6. Do not copy private course slides, past papers, database files or `.env` into Git. Keep private banks in an ignored `private/` directory.

Scripted agents can use `session-start`, `session`, `answer --file`, `reveal --file`, `rate`, `finish`, `question`, and `export`. Session answer files include `version`, `revision`, `response` and optional `rating`; versions/revisions come from the current session view. Never guess them or retry a rejected write blindly. `question <deck> <id>` returns the current question and revision; update with `--file question.json --revision N`.

## Change rules

- Author and preserve `depends_on` prerequisite IDs. Read the prerequisite section in `docs/QUESTION_BANK.md` before generating questions. Run `recall prerequisites <deck>` alongside the coverage audit. Definitions precede variant definitions and applications; every listed parent is required. Keep dependency-only updates separate from wording corrections so mastery is preserved. Validate the complete prospective graph, including cross-topic links, before replacing or archiving records.
- Normal Learn must never bypass locks. Only an explicit Cram/Test override may do so. Unlocking is independent of review dates. Keep live and downloaded session transitions in `src/core/study.ts`; newly eligible objectives enter the next working set in a running learning session. Learn starts with recognition (authored choices or existing answer options), then recall; keep at most 16 active objectives and finish the current set before introducing fresh ones. Session-only `learn-choice` options must not modify the question bank or semantic hashes.

- Server clients and the CLI use the same PostgreSQL services. Device-only clients use IndexedDB with the same grading/session engine. No SQLite fallback. Keep the personal workspace separate from server downloads and outbox state; never silently turn a failed server download into an empty personal workspace.
- Device-only mode must work on first launch with zero quiz API requests, including import/edit/export. Sharing defaults to questions only. Progress restore must be explicit and idempotent, with content-hash checks; never add counters from two exported snapshots. Validate the complete graph before applying any local changes.
- Never embed deployment addresses or credentials in installers, static web assets or APKs. Android native file handling is origin-bound, main-frame only, capped at 5 MB, and limited to user-selected JSON imports/exports. Do not expose a general filesystem bridge.
- Build installers with `desktop/windows/build.ps1`, then run `npm run test:installer` on Windows. Android's Gradle pre-build bundles the standalone UI. Release assets must contain synthetic app assets only; real study banks stay outside Git and public downloads.
- `--server URL` or `RECALL_SERVER_URL` selects HTTP; otherwise the CLI uses PostgreSQL directly. Do not expose PostgreSQL to the internet for agents or mobile clients.
- Downloaded clients pick up changes on explicit refresh. Sync progress before replacing downloads. Offline evidence for edited/archived questions is retained but excluded from mastery.
- MC success alone cannot establish mastery. Self-assessment must stay explicit.
- Corrections reset affected mastery and invalidate obsolete results. Preserve progress for explanation-only changes.
- Keep submitted answers atomic and idempotent through session-version checks and row locks.
- Do not add executable question templates. Formats are declarative data.
- Run `npm test`, `npm run test:integration`, and `npm run build` for engine/API changes. Integration tests require a disposable PostgreSQL test server with CREATEDB access. UI changes should also be checked in the browser at desktop and mobile widths.
- Regenerate the schema using `npm run schema` after bank-schema changes.

Use the existing Git author configured by the user. Do not append an assistant co-author. Do not create or push repositories unless the user has authorised it.

Pending server evidence can be exported from Settings without a network request. Read the recovery section of `docs/PORTABLE.md`: `recovery-inspect` is file-only; `recover` previews matching destination IDs, and `recover --apply` replays through the same revision checks and idempotent server grading as normal sync. Never treat these private typed-answer files as shareable quiz banks or clear an outbox merely because export succeeded.
