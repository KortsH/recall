# Recall

A focused exam learning tool. Bring a question bank, download it to your device, and progress from recognition to active recall. React + TypeScript + Vite, a plain Node HTTP server, and PostgreSQL. Local or private home-server deployment; no AI integration, account, or subscription.

Downloaded mode studies on the device and syncs progress in batches. Live-server mode is optional. Install the PWA on your phone to share quizzes and progress through the server. See [hosting and mobile use](docs/HOSTING.md) and [future work](docs/FUTURE.md).

![Recall deck overview](docs/overview.jpg)

## Run locally

Node 22.12+ (24 recommended), npm, and PostgreSQL 17 or Docker.

```sh
npm ci
# Copy .env.example to .env, then set DATABASE_URL if using your own PostgreSQL.
docker compose up -d db
npm run seed
npm run dev
```

Open http://127.0.0.1:5173. `npm run dev` starts both the browser dev server and Node API. The schema is created automatically. `npm run seed` imports the compact 22-question DAC/MAC foundation bank; it is an explicit command so startup cannot overwrite your corrections. Repeating it updates matching IDs.

For the built app:

```sh
npm run build
npm start
```

Open http://127.0.0.1:4310. This is one Node process serving the frontend and API. If a database isn't available, startup explains how to connect one. The database persists separately from the app.

For an existing project-local PostgreSQL cluster, optionally set `RECALL_PGDATA` and `PG_BIN` in your ignored `.env`, then use `npm run local`. It starts that explicitly configured cluster if needed, then serves the built app. It never creates or changes a system PostgreSQL service.

Or run the whole stack in Docker:

```sh
docker compose up --build -d
docker compose exec app npm run seed
```

Open http://127.0.0.1:4310. Stop with `docker compose down`; progress remains in the named volume. Host and Docker URLs differ: host CLI commands use the URL in `.env`; commands inside the app container use the configured `db` hostname. The default password is for local development. This is a single-user local application, bound to loopback by default; authentication and public hosting are outside its scope.

## Study

- **Learn:** weak and unseen objectives, recognition followed by written recall, with interleaved retries. Each objective has a bounded number of attempts per session; continue in another session when needed.
- **Cram:** ignores future review dates, prioritises weak/unseen material, and rotates topics.
- **Flashcards:** reveal, then Again / Hard / Good / Easy. Self-assessments are recorded as such.
- **Test:** random questions, optional timer, feedback withheld until the end. Written answers without exact grading rules are self-assessed after the test. Unanswered and edited questions are reported separately from graded accuracy.

Three consecutive successes, including two written or self-rated recalls, establish initial mastery. Recognition alone cannot. Mistakes reset the streak. Successful recall schedules a later review; mastered material returns after one day (three for Easy). Hard returns sooner. These are deliberately simple rules, not a claim of measured long-term retention.

Typed rule sets accept either order using explicit aliases, with semicolons/newlines between parts. General prose uses a model answer and rubric; there is no fuzzy or AI grader. Matching and scenario variants are authored explicitly. A one-objective deck won't immediately repeat the same question after a mistake; practise it again in another session.

Use **“Something off? Edit question”** after answering. The simple editor handles wording, answers, choices, accepted wording, and multi-part rules. The JSON tab handles all variants and rubrics. Semantic corrections reset only that objective and exclude obsolete attempts from results; explanation/tag changes preserve progress. Imports are additive updates, not deletions.

Keyboard: 1–9 select choices, Enter checks/continues, Ctrl/⌘+Enter submits typed answers, 1–4 rate revealed flashcards. Escape closes dialogs. Every submitted answer saves; Save & leave pauses the session, and Resume restores it.

## Import and CLI

```sh
npm run recall -- validate examples/data-protection.json
npm run recall -- import questions.json --deck "Data Protection" --json
npm run recall -- import replacement.json --replace --dry-run --json
npm run recall -- import replacement.json --replace --json
npm run recall -- questions "Data Protection" --topic MAC --json
npm run recall -- audit "Data Protection"
npm run recall -- decks
npm run recall -- learn "Data Protection" --cram --topic MAC
npm run recall -- flashcards "Data Protection"
npm run recall -- test "Data Protection" --questions 25 --minutes 30
npm run recall -- stats "Data Protection"
npm run recall -- wrong "Data Protection"
npm run recall -- export "Data Protection" -o questions.json
```

Optionally run `npm link` to make `recall` available directly. Run commands from the repository directory so `.env` resolves predictably. The CLI talks directly to the same PostgreSQL database through the same learning engine; the HTTP server need not be running.

JSON is canonical. CSV/TSV imports need `--deck`; headers are `id,question,answer,topic,explanation,difficulty,tags` (only the first three are required; tags use `|`). CSV/TSV produces written/self-rated objectives and flashcards. Use JSON for choices, structured grading, matching, and scenarios. Validation reports malformed fields before any changes are made. Stable question IDs are required and unique within a deck; repeat imports update those IDs without duplicating questions.

See [the bank format](docs/QUESTION_BANK.md), [the JSON Schema](docs/question-bank.schema.json), and [agent instructions](AGENTS.md).

Use `--server URL` or `RECALL_SERVER_URL` for CLI operations against a shared server. `import --replace` archives missing IDs; `--topic` scopes replacement. Dry runs report IDs first. `archive`, `restore`, question editing, deck updates, sessions, self-assessment, statistics and exports are available through the CLI. Audit highlights potential concept/wording overlap without deleting useful recall/application pairs.

## Verify

```sh
npm test                  # Grading, scheduling, bank validation; no database
npm run test:integration   # Real PostgreSQL, HTTP and CLI
npm run build             # TypeScript + production frontend
npm run check             # All three
```

Integration tests create and drop a uniquely named test database on the configured server. The database user needs CREATEDB, or set `TEST_DATABASE_ADMIN_URL` to a suitable dedicated local test-server connection. Tests never truncate the development database. CI runs these checks against PostgreSQL 17.

Course slides and past papers are not included in this repository. The example bank is a small, original practice set based on core DAC/MAC concepts; review wording against your course, particularly policy variants. Other topics can be added through the same schema without application changes.

MIT licensed.
