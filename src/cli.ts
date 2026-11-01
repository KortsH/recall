#!/usr/bin/env node
import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { writeFile, readFile } from "node:fs/promises";
import { createPool, migrate } from "./server/db.ts";
import { Store } from "./server/store.ts";
import { readBank } from "./core/bank.ts";
import { remoteBackend, type Backend } from "./remote.ts";
import { auditQuestions } from "./core/audit.ts";

const program = new Command()
  .name("recall")
  .description("Local, adaptive exam practice. No AI service required.")
  .version("0.1.0");
program.option(
  "--server <url>",
  "Use a shared server instead of a direct PostgreSQL connection",
);
let pool: ReturnType<typeof createPool> | undefined;
let store: Backend | undefined;
async function connect() {
  if (!store) {
    const url = program.opts().server ?? process.env.RECALL_SERVER_URL;
    if (url) {
      store = remoteBackend(url);
      return store;
    }
    pool = createPool();
    await migrate(pool);
    store = new Store(pool);
  }
  return store;
}
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
program
  .command("import <file>")
  .option("--deck <name>", "Override deck name")
  .option("--json", "Print machine-readable result")
  .option("--replace", "Archive active questions absent from this bank")
  .option("--topic <topic>", "Scope replacement to one topic")
  .option("--dry-run", "Preview changes without writing")
  .action(async (file, o) => {
    const bank = await readBank(file, o.deck);
    const result = await (
      await connect()
    ).importBank(bank, {
      replace: o.replace,
      topic: o.topic,
      dryRun: o.dryRun,
    });
    if (o.json) print(result);
    else
      console.log(
        `${o.dryRun ? "PREVIEW — " : ""}${bank.deck}: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.archived} archived; ${result.reviewReset} progress resets.\nDeck: ${result.deckId}`,
      );
  });
program
  .command("validate <file>")
  .option("--deck <name>")
  .action(async (file, o) => {
    const bank = await readBank(file, o.deck);
    print({ valid: true, deck: bank.deck, questions: bank.questions.length });
  });
program
  .command("decks")
  .option("--json")
  .action(async (o) => {
    const decks = await (await connect()).decks();
    if (o.json) print(decks);
    else
      console.table(
        decks.map((d) => ({
          id: d.id,
          deck: d.name,
          questions: d.stats.total,
          mastered: d.stats.mastered,
          unseen: d.stats.unseen,
        })),
      );
  });
program
  .command("stats <deck>")
  .option("--json")
  .action(async (deck, o) => {
    const d = await (await connect()).deck(deck);
    if (o.json) print(d);
    else {
      console.log(
        `${d.name}: ${d.stats.mastered}/${d.stats.total} mastered · ${d.stats.unseen} unseen · ${d.stats.due} due`,
      );
      console.table(d.stats.topics);
    }
  });
program
  .command("wrong <deck>")
  .option("--json")
  .action(async (deck, o) => {
    const s = await connect();
    const d = await s.deck(deck);
    const wrong = (await s.items(d.id))
      .filter((i) => i.progress.wrong)
      .sort((a, b) => b.progress.wrong - a.progress.wrong)
      .map((i) => ({
        id: i.question.id,
        topic: i.question.topic,
        question: i.question.question,
        wrong: i.progress.wrong,
      }));
    if (o.json) print(wrong);
    else console.table(wrong);
  });
program
  .command("export <deck>")
  .requiredOption("-o, --output <file>")
  .action(async (deck, o) => {
    const s = await connect();
    const d = await s.deck(deck);
    await writeFile(
      o.output,
      JSON.stringify(await s.exportBank(d.id), null, 2) + "\n",
    );
    console.log(`Exported ${d.name} to ${o.output}`);
  });
program
  .command("question <deck> <id>")
  .option("--file <file>", "Replace from a question JSON file")
  .option("--revision <number>", "Required revision when updating")
  .action(async (deck, id, o) => {
    const s = await connect();
    const d = await s.deck(deck);
    if (o.file) {
      if (!o.revision)
        throw new Error(
          "Supply --revision from recall question before editing",
        );
      print(
        await s.editQuestion(
          d.id,
          id,
          JSON.parse(await readFile(o.file, "utf8")),
          Number(o.revision),
        ),
      );
    } else print(await s.question(d.id, id));
  });

program
  .command("questions <deck>")
  .option("--topic <topic>")
  .option("--concept <concept>")
  .option("--skill <skill>", "recall or application")
  .option("--search <text>")
  .option("--archived", "Include archived questions")
  .option("--json")
  .action(async (deck, o) => {
    const s = await connect();
    const d = await s.deck(deck);
    const rows = await s.listQuestions(d.id, {
      topic: o.topic,
      concept: o.concept,
      skill: o.skill,
      search: o.search,
      archived: o.archived,
    });
    if (o.json) print(rows);
    else
      console.table(
        rows.map((i) => ({
          id: i.question.id,
          topic: i.question.topic,
          concept: i.question.concept,
          skill: i.question.skill ?? "recall",
          question: i.question.question,
          archived: i.archived,
        })),
      );
  });
program
  .command("audit <deck>")
  .option("--file <file>", "Compare an incoming bank with the existing deck")
  .action(async (deck, o) => {
    const s = await connect();
    const d = await s.deck(deck);
    if (o.file) {
      const bank = await readBank(o.file);
      print(
        auditQuestions(
          bank.questions,
          (await s.items(d.id)).map((i) => i.question),
        ),
      );
    } else print(await s.audit(d.id));
  });
for (const restore of [false, true])
  program
    .command(`${restore ? "restore" : "archive"} <deck> <id>`)
    .action(async (deck, id) => {
      const s = await connect();
      const d = await s.deck(deck);
      print(await s.archiveQuestion(d.id, id, restore));
    });
program
  .command("deck-update <deck>")
  .option("--name <name>")
  .option("--description <text>")
  .action(async (deck, o) => {
    const s = await connect();
    const d = await s.deck(deck);
    print(await s.updateDeck(d.id, o));
  });
async function study(
  deck: string,
  mode: string,
  o: Record<string, string | boolean>,
) {
  const s = await connect();
  const d = await s.deck(deck);
  let view = o.resume
    ? await s.getSession(String(o.resume))
    : await s.createSession(d.id, {
        mode: o.cram ? "cram" : mode,
        topic: o.topic ? String(o.topic) : undefined,
        count: Number(o.questions ?? 20),
        minutes: Number(o.minutes ?? 0),
      });
  const rl = createInterface({ input: stdin, output: stdout });
  console.log(
    `\n${d.name} · ${view.mode}\nSession ${view.id}\nType :quit at any question to pause; resume with --resume ${view.id}.\n`,
  );
  const ask = async (prompt: string) => {
    const a = await rl.question(prompt);
    if (a === ":quit")
      throw new Error(`Paused. Resume with --resume ${view.id}`);
    return a;
  };
  try {
    while (!view.finished && view.card) {
      const c = view.card;
      console.log(
        `\n[${view.cursor + 1}/${view.total}] ${c.topic} · ${c.format}\n${c.question}`,
      );
      let response: unknown;
      if (c.options) {
        c.options.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
        const a = await ask(
          c.format === "multiple_select"
            ? "Numbers, separated by commas: "
            : "Number: ",
        );
        response = a
          .split(",")
          .map((x) => c.options![Number(x.trim()) - 1] ?? x.trim());
      } else if (c.left && c.right) {
        c.right.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
        const pairs: Record<string, string> = {};
        for (const left of c.left)
          pairs[left] = c.right[Number(await ask(`${left} → number: `)) - 1];
        response = pairs;
      } else if (c.format === "flashcard") {
        await ask("Recall the answer, then press Enter to reveal. ");
        response = "";
      } else
        response = await ask(
          "Answer (separate required parts with semicolons): ",
        );
      let rating: string | undefined;
      if (c.selfGrade && view.mode !== "test") {
        const reveal = await s.reveal(view.id, {
          version: view.version,
          revision: c.revision,
          response,
        });
        view = { ...view, version: reveal.version };
        console.log(`\n${reveal.answer}\n${reveal.explanation}`);
        if (reveal.rubric.length)
          console.log(reveal.rubric.map((x) => `• ${x}`).join("\n"));
        do {
          rating = (
            await ask("Rate: again / hard / good / easy: ")
          ).toLowerCase();
        } while (!["again", "hard", "good", "easy"].includes(rating));
      }
      const result = await s.answer(view.id, {
        version: view.version,
        revision: c.revision,
        response,
        rating,
      });
      view = result.session;
      if (result.feedback) {
        console.log(
          `\n${result.feedback.correct ? "✓ Correct" : "↻ Keep practising"}\n${result.feedback.answer}\n${result.feedback.explanation}`,
        );
        await ask("Enter to continue. ");
      }
    }
    if (view.result) {
      console.log(
        `\nResult: ${view.result.correct}/${view.result.graded} graded answers; ${view.result.pending} awaiting self-assessment; ${view.result.unanswered} unanswered.`,
      );
      for (const a of view.result.answers) {
        console.log(
          `\n${a.question}\nYour answer: ${JSON.stringify(a.response)}\nModel: ${a.answer}\n${a.explanation}${a.outdated ? "\nChanged question: excluded from score." : ""}`,
        );
        if (a.rubric?.length)
          console.log(a.rubric.map((point) => `• ${point}`).join("\n"));
        if (a.correct === null && !a.outdated) {
          let rating = "";
          do {
            rating = (
              await ask("Rate: again / hard / good / easy: ")
            ).toLowerCase();
          } while (!["again", "hard", "good", "easy"].includes(rating));
          view = await s.rateTest(view.id, a.index, rating);
        }
      }
      console.table(view.result?.topics);
    }
  } finally {
    rl.close();
  }
}
for (const mode of ["learn", "flashcards", "test"])
  program
    .command(`${mode} <deck>`)
    .option("--topic <topic>")
    .option("--questions <number>", "Session size", "20")
    .option("--minutes <number>", "Optional test time limit", "0")
    .option("--cram", "Ignore review dates")
    .option("--resume <session-id>")
    .action((deck, o) => study(deck, mode, o));
program.command("sessions <deck>").action(async (deck) => {
  const s = await connect();
  const d = await s.deck(deck);
  print(await s.recentSessions(d.id));
});
program
  .command("session-start <deck>")
  .option("--mode <mode>", "learn, cram, flashcards, test", "learn")
  .option("--topic <topic>")
  .option("--questions <number>", "Session size", "20")
  .action(async (deck, o) => {
    const s = await connect();
    const d = await s.deck(deck);
    print(
      await s.createSession(d.id, {
        mode: o.mode,
        topic: o.topic,
        count: Number(o.questions),
      }),
    );
  });
program
  .command("session <id>")
  .action(async (id) => print(await (await connect()).getSession(id)));
program
  .command("answer <id>")
  .requiredOption(
    "--file <file>",
    "JSON: version, revision, response; optionally rating",
  )
  .action(async (id, o) =>
    print(
      await (
        await connect()
      ).answer(id, JSON.parse(await readFile(o.file, "utf8"))),
    ),
  );
program
  .command("reveal <id>")
  .requiredOption("--file <file>", "JSON: version, revision, response")
  .action(async (id, o) =>
    print(
      await (
        await connect()
      ).reveal(id, JSON.parse(await readFile(o.file, "utf8"))),
    ),
  );
program
  .command("rate <id> <index> <rating>")
  .action(async (id, index, rating) =>
    print(await (await connect()).rateTest(id, Number(index), rating)),
  );
program
  .command("finish <id> <version>")
  .action(async (id, version) =>
    print(await (await connect()).finish(id, Number(version))),
  );
try {
  await program.parseAsync();
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
