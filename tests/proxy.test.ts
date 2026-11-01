import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("local proxy rejects rebinding, foreign targets and malformed URLs without forwarding or crashing", async () => {
  let forwarded = 0;
  const upstream = createServer((_req, res) => {
    forwarded++;
    res.end("ok");
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const portOf = (s: ReturnType<typeof createServer>) =>
    (s.address() as { port: number }).port;
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = portOf(reserve);
  await new Promise<void>((r) => reserve.close(() => r()));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/server/proxy.ts"],
    {
      env: {
        ...process.env,
        RECALL_SERVER_URL: `http://127.0.0.1:${portOf(upstream)}`,
        PORT: String(port),
        HOST: "127.0.0.1",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  async function call(path: string, host = `127.0.0.1:${port}`) {
    return new Promise<number>((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port, path, headers: { host } },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      req.on("error", reject);
      req.end();
    });
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Proxy startup timed out")),
        5000,
      );
      child.stdout!.on("data", () => {
        clearTimeout(timer);
        resolve();
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Proxy exited: ${code}`));
      });
    });
    assert.equal(await call("/api/health", "attacker.example"), 403);
    assert.equal(await call("http://attacker.example/"), 400);
    assert.equal(await call("http://[invalid"), 400);
    assert.equal(await call("/api/health"), 200);
    assert.equal(forwarded, 1);
  } finally {
    const exited = once(child, "exit");
    child.kill();
    await exited;
    await new Promise<void>((r) => upstream.close(() => r()));
  }
});
