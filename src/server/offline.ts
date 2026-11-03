import type { Store } from "./store.ts";
import { AppError } from "./store.ts";
import { transaction } from "./db.ts";
import { evaluateAttempt } from "../core/study.ts";
import { updateProgress } from "../core/engine.ts";
import type { Session, Attempt } from "../core/types.ts";
import { emptyProgress } from "../core/types.ts";
import { recallDirection } from "../core/questions.ts";
import { choiceConnections } from "../core/feedback.ts";

/** Merge append-only attempt evidence. Never trust a client's claimed correctness. */
export async function syncOfflineSession(store: Store, input: Session) {
  if (
    !input ||
    !/^[-a-f0-9]{36}$/i.test(input.id) ||
    !["learn", "cram", "flashcards", "test"].includes(input.mode) ||
    !Array.isArray(input.answers) ||
    !Array.isArray(input.queue) ||
    input.queue.length > 2000 ||
    input.answers.length > 2000 ||
    input.cursor !== input.answers.length ||
    input.cursor > input.queue.length
  )
    throw new AppError("Malformed downloaded session");
  await store.deck(input.deckId);
  return transaction(store.pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "recall-sync:" + input.deckId,
    ]);
    const epoch = (
      await db.query("SELECT learning_epoch FROM decks WHERE id=$1", [
        input.deckId,
      ])
    ).rows[0].learning_epoch;
    if ((input.learningEpoch ?? 0) !== epoch)
      throw new AppError(
        "Learning was reset for this deck. Export any pending evidence, then discard outdated answers and reload the deck in Settings.",
        409,
        "LEARNING_RESET",
      );
    const row = (
      await db.query("SELECT data FROM sessions WHERE id=$1 FOR UPDATE", [
        input.id,
      ])
    ).rows[0];
    const prior = row?.data as Session | undefined;
    if (prior && (prior.deckId !== input.deckId || prior.mode !== input.mode))
      throw new AppError("Session identity conflict", 409);
    if (prior && prior.answers.length > input.answers.length)
      throw new AppError(
        "The server has newer session answers. Refresh before continuing.",
        409,
      );
    if (!prior)
      await db.query("INSERT INTO sessions(id,deck_id,data) VALUES($1,$2,$3)", [
        input.id,
        input.deckId,
        input,
      ]);
    const all = await store.items(input.deckId, db, true);
    const answers: Attempt[] = [];
    const rejected: string[] = [];
    for (let index = 0; index < input.answers.length; index++) {
      const submitted = input.answers[index];
      const entry = input.queue[index];
      if (
        !submitted ||
        !entry ||
        entry.questionId !== submitted.questionId ||
        typeof submitted.variantId !== "string"
      )
        throw new AppError("Attempt does not match its question queue");
      const item = all.find((i) => i.question.id === submitted.questionId);
      if (!item) throw new AppError("Unknown question in downloaded session");
      const locked = (
        await db.query(
          "SELECT q.data,q.revision,q.archived_at,p.data AS progress FROM questions q LEFT JOIN progress p ON p.deck_id=q.deck_id AND p.question_id=q.id WHERE q.deck_id=$1 AND q.id=$2 FOR UPDATE OF q",
          [input.deckId, item.question.id],
        )
      ).rows[0];
      item.question = locked.data;
      item.revision = locked.revision;
      item.archived = !!locked.archived_at;
      item.progress = locked.progress ?? emptyProgress();
      const old = (
        await db.query(
          "SELECT data,invalidated FROM attempts WHERE session_id=$1 AND ordinal=$2",
          [input.id, index],
        )
      ).rows[0];
      if (
        old &&
        (old.data.questionId !== submitted.questionId ||
          !!old.data.hintUsed !== !!submitted.hintUsed ||
          !!old.data.mentalRecall !== !!submitted.mentalRecall ||
          JSON.stringify(old.data.response) !==
            JSON.stringify(submitted.response))
      )
        throw new AppError("An existing attempt cannot be rewritten", 409);
      const stale = item.archived || item.revision !== submitted.revision;
      let attempt: Attempt;
      if (old && old.data.correct !== null)
        attempt = { ...old.data, invalidated: old.invalidated || stale };
      else if (stale || item.question.flag) {
        attempt = { ...submitted, correct: null, invalidated: true };
        delete attempt.confusedWith;
        rejected.push(item.question.id);
      } else {
        if (input.mode === "test" && !input.finished && submitted.rating)
          throw new AppError("Finish the test before self-assessing");
        attempt = evaluateAttempt(
          item,
          entry.variantId,
          submitted.response,
          submitted.rating,
          input.mode === "test",
          Number.isFinite(Date.parse(submitted.at))
            ? submitted.at
            : new Date().toISOString(),
          submitted.hintUsed === true || prior?.hinted?.cursor === index,
          submitted.mentalRecall === true,
        );
        if (entry.retentionCheck) attempt.retentionCheck = true;
        const connections = choiceConnections(attempt, all);
        if (connections) attempt.confusedWith = connections;
        if (attempt.correct !== null) {
          item.progress = updateProgress(
            item.progress,
            attempt.correct,
            attempt.format,
            attempt.selfAssessed,
            new Date(),
            attempt.rating,
            attempt.skill,
            attempt.hintUsed,
            recallDirection(item.question, attempt.variantId),
          );
          await db.query(
            "INSERT INTO progress(deck_id,question_id,data) VALUES($1,$2,$3) ON CONFLICT(deck_id,question_id) DO UPDATE SET data=$3",
            [input.deckId, item.question.id, item.progress],
          );
        }
      }
      delete (attempt as Attempt & { answerImage?: unknown }).answerImage;
      if (old)
        await db.query(
          "UPDATE attempts SET data=$3,invalidated=$4 WHERE session_id=$1 AND ordinal=$2",
          [input.id, index, attempt, !!attempt.invalidated],
        );
      else
        await db.query(
          "INSERT INTO attempts(session_id,ordinal,deck_id,question_id,revision,data,invalidated) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            input.id,
            index,
            input.deckId,
            item.question.id,
            attempt.revision,
            attempt,
            !!attempt.invalidated,
          ],
        );
      await db.query(
        "INSERT INTO offline_events(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2",
        [
          `${input.id}:${index}`,
          { correct: attempt.correct, invalidated: !!attempt.invalidated },
        ],
      );
      answers.push(attempt);
    }
    const session: Session = {
      ...input,
      answers,
      version: Math.max(prior?.version ?? 0, input.version) + 1,
    };
    // Only queue/session fields are accepted; scoring comes from validated attempt evidence above.
    await db.query("UPDATE sessions SET data=$2,updated_at=now() WHERE id=$1", [
      session.id,
      session,
    ]);
    return {
      session,
      rejected: [...new Set(rejected)],
      progress: Object.fromEntries(
        all.map((i) => [
          i.question.id,
          { revision: i.revision, progress: i.progress },
        ]),
      ),
    };
  });
}
