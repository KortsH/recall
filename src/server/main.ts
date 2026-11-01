import { createPool, migrate } from "./db.ts";
import { Store } from "./store.ts";
import { createApp } from "./http.ts";
const pool = createPool();
try {
  await migrate(pool);
  const app = createApp(new Store(pool));
  app.listen(
    Number(process.env.PORT ?? 4310),
    process.env.HOST ?? "127.0.0.1",
    () =>
      console.log(
        `Recall ready at http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? 4310}`,
      ),
  );
  const stop = () =>
    app.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (e) {
  console.error(
    `Cannot start Recall: ${(e as Error).message}\nCheck DATABASE_URL and start PostgreSQL (docker compose up -d db).`,
  );
  await pool.end();
  process.exitCode = 1;
}
