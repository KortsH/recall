import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

test(
  "backup retention and failure handling preserve verified archives and report unhealthy runs",
  { skip: process.platform === "win32" },
  () => {
    const bash = "/bin/bash";
    assert.ok(existsSync(bash), "Backup checks require a POSIX host with Bash");
    const result = spawnSync(bash, ["tests/backup.test.sh"], {
      encoding: "utf8",
      timeout: 60000,
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  },
);
