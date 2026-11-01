# Architecture

`React → Node HTTP → Store → pure learning engine + PostgreSQL`. The CLI calls Store directly. PostgreSQL is the source of truth; the browser keeps only the current interaction state, and server sessions persist their queue/cursor/answers. A small connection pool avoids reconnecting for every question. No cross-request question cache can become stale after a correction.

Tables: decks, versioned JSONB question definitions, objective progress, sessions, and immutable attempt snapshots with invalidation flags. JSONB lets formats evolve while ordinary keys and constraints enforce identity. SQL queries are parameterised.

Submission locks the session and objective, checks the session version and question revision, writes attempt/progress, and advances the queue in one transaction. Duplicate or stale submissions fail instead of double-counting. Imports and edits use the same question-write service. Semantic hashes use canonical key ordering; explanation-only edits preserve mastery.

Learn ranks weak/unseen objectives, rotates topic groups, starts with recognition where possible, and queues active recall. Retries wait behind other questions; at a session tail, a different objective can act as an interlude. Each objective gets at most three scheduled follow-ups; this keeps sessions finite. A one-objective deck stops instead of immediately repeating. Flashcards have one pass per selected objective. Tests randomise selection and withhold feedback, with explicit post-test self-assessment for prose.

Mastery is an initial scheduling state, not a guarantee of long-term retention: three consecutive correct responses, at least two active recalls, and later due reviews. Wrong answers clear the streak and recall count. Self-assessed evidence is counted separately, even when it contributes to mastery. Accuracy excludes obsolete revisions and ungraded written answers; unanswered test items are shown separately.

No multi-user account system, public deployment, PDF processing, AI calls, or executable question generators. Storage can evolve without changing the pure engine or format adapters.
