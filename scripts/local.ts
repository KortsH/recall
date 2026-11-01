import "dotenv/config";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Optional convenience for an already initialised, explicitly configured local cluster.
// Normal installations use an external PostgreSQL service or docker compose.
if (!process.env.RECALL_SERVER_URL && process.env.RECALL_PGDATA) {
  const ctl = process.env.PG_BIN
    ? join(
        process.env.PG_BIN,
        process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl",
      )
    : "pg_ctl";
  const data = process.env.RECALL_PGDATA;
  try {
    execFileSync(ctl, ["-D", data, "status"], {
      stdio: "pipe",
      windowsHide: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "pg_ctl not found. Set PG_BIN or start PostgreSQL manually.",
      );
    }
    const port = new URL(process.env.DATABASE_URL!).port || "5432";
    execFileSync(
      ctl,
      [
        "-D",
        data,
        "-l",
        join(data, "recall.log"),
        "-o",
        `-h 127.0.0.1 -p ${port}`,
        "-w",
        "start",
      ],
      { stdio: "inherit", windowsHide: true },
    );
  }
}
if (process.env.RECALL_SERVER_URL) await import("../src/server/proxy.ts");
else await import("../src/server/main.ts");
