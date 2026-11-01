# Working on Recall

Recall is a small, single-user local study tool. Prioritise a smooth study loop and correct progress over infrastructure. No in-app AI, PDF ingestion, cloud accounts, or paid APIs.

## Where things live

- `src/core/types.ts`: question/variant, progress, session and attempt types.
- `src/core/bank.ts`: canonical validation, file import, generated formats, semantic hashing.
- `src/core/engine.ts`: pure grading, scheduling, topic interleaving, retry selection.
- `src/server/store.ts`: shared application services, PostgreSQL transactions and sessions.
- `src/server/http.ts`: plain Node HTTP adapter and built frontend serving.
- `src/cli.ts`: interactive and scriptable CLI using the same services.
- `src/web/`: React UI. Keep grading and mastery logic out of it.
- `examples/data-protection.json`: original starter bank, no course documents.

## Generate/import questions

1. Read `docs/QUESTION_BANK.md` and `docs/question-bank.schema.json`.
2. Use stable, meaningful IDs and explicit correct answers, explanations and aliases. Do not infer permissions from policy constraints. Identify Biba/watermark variants precisely.
3. One question record is one learning objective. Its automatic choice/written/flashcard formats and explicit variants share progress. Distinct objectives should have distinct IDs.
4. Generate JSON externally. Run `npm run recall -- validate path.json`, then `npm run --silent recall -- import path.json --json` (the silent npm wrapper keeps stdout machine-readable).
5. Inspect counts and errors. Preserve existing IDs when correcting a bank. Export a deck before bulk editing if needed. Import does not remove absent IDs.
6. Do not copy private course slides, past papers, database files or `.env` into Git. Keep private banks in an ignored `private/` directory.

Scripted agents can use `session-start`, `session`, `answer --file`, `reveal --file`, `rate`, `finish`, `question`, and `export`. Session answer files include `version`, `revision`, `response` and optional `rating`; versions/revisions come from the current session view. Never guess them or retry a rejected write blindly. `question <deck> <id>` returns the current question and revision; update with `--file question.json --revision N`.

## Change rules

- The browser and CLI must use the same engine and database. No SQLite fallback.
- MC success alone cannot establish mastery. Self-assessment must stay explicit.
- Corrections reset affected mastery and invalidate obsolete results. Preserve progress for explanation-only changes.
- Keep submitted answers atomic and idempotent through session-version checks and row locks.
- Do not add executable question templates. Formats are declarative data.
- Run `npm test`, `npm run test:integration`, and `npm run build` for engine/API changes. Integration tests require a disposable PostgreSQL test server with CREATEDB access. UI changes should also be checked in the browser at desktop and mobile widths.
- Regenerate the schema using `npm run schema` after bank-schema changes.

Use the existing Git author configured by the user. Do not append an assistant co-author. Do not create or push repositories unless the user has authorised it.
