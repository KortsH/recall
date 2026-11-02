import "dotenv/config";
import pg from "pg";
export const databaseUrl = () =>
  process.env.DATABASE_URL ?? "postgres://recall:recall@127.0.0.1:55432/recall";
export function createPool(url = databaseUrl()) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 6,
    connectionTimeoutMillis: 5000,
  });
  // Idle sockets can fail when PostgreSQL restarts. The pool removes that client;
  // handling the event prevents a recoverable disconnect from killing Node.
  pool.on("error", (error) => {
    console.error(`PostgreSQL idle connection closed: ${error.message}`);
  });
  return pool;
}
export type DB = pg.Pool | pg.PoolClient;
export async function transaction<T>(
  pool: pg.Pool,
  fn: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function migrate(pool: pg.Pool) {
  await transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(73104310)");
    await db.query(`
      CREATE TABLE IF NOT EXISTS decks (id text PRIMARY KEY, name text UNIQUE NOT NULL, description text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE decks ADD COLUMN IF NOT EXISTS learning_epoch integer NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS questions (deck_id text NOT NULL REFERENCES decks(id) ON DELETE CASCADE, id text NOT NULL, data jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, content_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(deck_id,id));
      CREATE TABLE IF NOT EXISTS progress (deck_id text NOT NULL, question_id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(deck_id,question_id), FOREIGN KEY(deck_id,question_id) REFERENCES questions(deck_id,id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, deck_id text NOT NULL REFERENCES decks(id) ON DELETE CASCADE, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS sessions_deck_idx ON sessions(deck_id,updated_at DESC);
      CREATE TABLE IF NOT EXISTS attempts (id bigserial PRIMARY KEY, session_id text NOT NULL REFERENCES sessions(id), ordinal integer NOT NULL, deck_id text NOT NULL, question_id text NOT NULL, revision integer NOT NULL, data jsonb NOT NULL, invalidated boolean NOT NULL DEFAULT false, UNIQUE(session_id,ordinal));
      CREATE INDEX IF NOT EXISTS attempts_question_idx ON attempts(deck_id,question_id);
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
      CREATE TABLE IF NOT EXISTS offline_events (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS authoring_receipts (id uuid PRIMARY KEY, deck_id text NOT NULL REFERENCES decks(id) ON DELETE CASCADE, request_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    `);
  });
}
