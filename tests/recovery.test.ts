import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBank } from "../src/core/bank.ts";
import { newSession, advanceSession } from "../src/core/study.ts";
import { createRecovery, parseRecovery } from "../src/core/recovery.ts";
import { emptyProgress } from "../src/core/types.ts";
const bank = parseBank({
  deck: "Recovery fixture",
  questions: [
    { id: "base", question: "Definition", answer: "A", acceptedAnswers: ["A"] },
  ],
});
function fixture() {
  const items = bank.questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
  const s = newSession("fixture", items, { mode: "learn", count: 1 });
  advanceSession(s, items[0], { version: 0, revision: 1, response: "A" });
  s.version++;
  return createRecovery([{ id: "fixture", bank }], [s]);
}
test("recovery files retain original session identity and typed evidence without a connection address", () => {
  const file = fixture();
  assert.deepEqual(
    parseRecovery(JSON.parse(JSON.stringify(file))),
    JSON.parse(JSON.stringify(file)),
  );
  assert.equal(file.sessions[0].answers[0].response, "A");
  assert.equal("server" in file, false);
});
test("recovery rejects duplicate sessions, broken answer identity and injected connection configuration", () => {
  const file = fixture();
  assert.throws(
    () =>
      parseRecovery({
        ...file,
        sessions: [...file.sessions, ...file.sessions],
      }),
    /Duplicate session/,
  );
  const changed = structuredClone(file);
  changed.sessions[0].answers[0].questionId = "other";
  assert.throws(() => parseRecovery(changed), /does not match/);
  assert.throws(
    () => parseRecovery({ ...file, server: "https://example.test" }),
    /Invalid recovery/,
  );
});
test("an obsolete variant can still be exported for server-side revision validation", () => {
  const file = fixture();
  file.sessions[0].queue[0].variantId = "removed-variant";
  assert.doesNotThrow(() => parseRecovery(file));
});
