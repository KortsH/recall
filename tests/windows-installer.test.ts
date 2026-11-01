import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, stat, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { request } from "node:http";

test(
  "one-command setup verifies checksums before running the installer",
  { skip: process.platform !== "win32" },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "recall-bootstrap-test-"));
    const installer = join(folder, "Recall-Setup.exe");
    await copyFile(resolve("build/windows/Recall-Setup.exe"), installer);
    const checksum = createHash("sha256")
      .update(await readFile(installer))
      .digest("hex");
    await writeFile(
      join(folder, "SHA256SUMS.txt"),
      `${checksum}  Recall-Setup.exe\n`,
    );
    const destination = join(folder, "install with spaces");
    const run = (target: string) =>
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          resolve("install.ps1"),
          "-ReleaseDirectory",
          folder,
          "-Destination",
          target,
          "-NoLaunch",
          "-NoShortcut",
        ],
        { windowsHide: true, stdio: "pipe", timeout: 15000 },
      );
    run(destination);
    assert.ok(
      (
        await stat(
          join(destination, "versions", "0.2.1-preview.1", "Recall.exe"),
        )
      ).size > 0,
    );
    await writeFile(
      join(folder, "SHA256SUMS.txt"),
      `${"0".repeat(64)}  Recall-Setup.exe\n`,
    );
    assert.throws(
      () => run(join(folder, "must-not-install")),
      /Command failed/,
    );
    await assert.rejects(stat(join(folder, "must-not-install")), {
      code: "ENOENT",
    });
  },
);

test(
  "Windows installer is repeatable and the bundled launcher serves only safe local assets",
  { skip: process.platform !== "win32" },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "recall-installer-test-"));
    const setup = resolve("build/windows/Recall-Setup.exe"),
      exe = join(folder, "versions", "0.2.1-preview.1", "Recall.exe");
    const install = () =>
      execFileSync(
        setup,
        [
          "--install-dir",
          folder,
          "--no-launch",
          "--shortcut-dir",
          join(folder, "shortcuts"),
          "--quiet",
        ],
        {
          windowsHide: true,
          timeout: 10000,
          env: { ...process.env, PATH: process.env.SystemRoot + "\\System32" },
        },
      );
    install();
    assert.ok((await stat(join(folder, "shortcuts", "Recall.lnk"))).size > 0);
    await writeFile(join(folder, "keep-me.txt"), "existing data");
    install();
    assert.equal(
      await readFile(join(folder, "keep-me.txt"), "utf8"),
      "existing data",
    );
    const child = spawn(
      exe,
      [
        "--data-dir",
        folder,
        "--port",
        "4323",
        "--no-browser",
        "--no-tray",
        "--quiet",
      ],
      {
        windowsHide: true,
        stdio: "ignore",
        env: { ...process.env, PATH: process.env.SystemRoot + "\\System32" },
      },
    );
    const exited = once(child, "exit");
    const call = (
      path: string,
      headers: Record<string, string> = {},
      method = "GET",
    ) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request(
          { hostname: "127.0.0.1", port: 4323, path, headers, method },
          (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => resolve({ status: res.statusCode!, body }));
          },
        );
        req.on("error", reject);
        req.end();
      });
    try {
      let ready = false;
      for (let n = 0; n < 40; n++) {
        try {
          if ((await call("/__recall/health")).status === 200) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(ready, true);
      assert.match((await call("/")).body, /Recall/);
      assert.equal((await call("/", { host: "attacker.example" })).status, 403);
      assert.equal((await call("/%2e%2e/instance.txt")).status, 403);
      assert.equal((await call("/instance.txt")).status, 404);
      assert.equal((await call("/api/snapshot")).status, 404);
      assert.equal((await call("/__recall/stop", {}, "POST")).status, 403);
      install();
      assert.equal((await call("/__recall/health")).status, 200);
      const [, _token] = (await readFile(join(folder, "instance.txt"), "utf8"))
        .trim()
        .split(/\r?\n/);
      assert.equal(
        (await call("/__recall/stop", { "X-Recall-Token": _token }, "POST"))
          .status,
        200,
      );
      await exited;
    } finally {
      if (child.exitCode === null) child.kill();
    }
  },
);
