import { createPool, migrate } from "../src/server/db.ts";
const pool = createPool();
try {
  await migrate(pool);
  console.log("Database ready.");
} finally {
  await pool.end();
}
