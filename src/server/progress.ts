import { createHash } from "node:crypto";
import type { Store } from "./store.ts";
import { AppError } from "./store.ts";
import { transaction, type DB } from "./db.ts";
import {
  parsePortable,
  exportPortable,
  questionDigest,
} from "../core/portable.ts";
import { canonical } from "../core/authoring.ts";
import { closeResetSession } from "../core/reset.ts";
import { emptyProgress, type Item, type Session } from "../core/types.ts";
import { updateProgress } from "../core/engine.ts";
import { recallDirection } from "../core/questions.ts";

/** An explicit snapshot restore, never a relabelled replay of pre-reset answers. */
export async function restoreProgress(
  store: Store,
  deckId: string,
  input: {
    file: unknown;
    apply?: boolean;
    expected?: string;
    requestId?: string;
  },
) {
  if (
    !input ||
    typeof input !== "object" ||
    (input.apply !== undefined && typeof input.apply !== "boolean")
  )
    throw new AppError("Invalid progress restore request");
  const parsed = parsePortable(input?.file);
  if (!parsed.progress || !Object.keys(parsed.progress).length)
    throw new AppError("Choose a quiz export that includes learning progress");
  const evidenceProgress = parsed.progress;
  const hash = createHash("sha256")
    .update(canonical({ deckId, file: input.file }))
    .digest("hex");
  return transaction(store.pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "recall-deck:" + deckId,
    ]);
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "recall-sync:" + deckId,
    ]);
    if (input.apply) {
      if (
        !input.requestId ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.requestId)
      )
        throw new AppError("A restore request ID is required");
      const receipt = (
        await db.query(
          "SELECT request_hash,result FROM progress_receipts WHERE id=$1",
          [input.requestId],
        )
      ).rows[0];
      if (receipt) {
        if (receipt.request_hash !== hash)
          throw new AppError("Restore request ID was reused", 409);
        return receipt.result;
      }
    }
    const deck = (
      await db.query("SELECT * FROM decks WHERE id=$1 FOR UPDATE", [deckId])
    ).rows[0];
    if (!deck) throw new AppError("Deck not found", 404);
    const items = await store.items(deckId, db, true);
    for (const [id, evidence] of Object.entries(evidenceProgress)) {
      const q = parsed.bank.questions.find((q) => q.id === id),
        item = items.find((i) => i.question.id === id && !i.archived);
      if (
        !q ||
        !item ||
        (await questionDigest(q)) !== evidence.hash ||
        (await questionDigest(item.question)) !== evidence.hash
      )
        throw new AppError(
          `Progress does not match the current question ${id}`,
          409,
        );
    }
    const expected = createHash("sha256")
      .update(canonical({ epoch: deck.learning_epoch, items }))
      .digest("hex");
    const backup = await exportPortable(
      {
        schemaVersion: 1,
        deck: deck.name,
        description: deck.description,
        questions: items.filter((i) => !i.archived).map((i) => i.question),
      },
      items,
      true,
    );
    const result = {
      dryRun: !input.apply,
      expected,
      questions: Object.keys(evidenceProgress).length,
      serverMastered: items.filter((i) => !i.archived && i.progress.mastered)
        .length,
      deviceMastered: Object.values(evidenceProgress).filter(
        (p) => p.progress.mastered,
      ).length,
      learningEpoch: deck.learning_epoch + 1,
      backup,
    };
    if (!input.apply) return result;
    if (input.expected !== expected)
      throw new AppError(
        "Server progress changed. Preview this restore again.",
        409,
      );
    const epoch = deck.learning_epoch + 1;
    // Keep other objectives as the baseline too; a partial restore must not erase them.
    for (const item of items) {
      const progress =
        evidenceProgress[item.question.id]?.progress ?? item.progress;
      await db.query(
        "INSERT INTO progress(deck_id,question_id,data) VALUES($1,$2,$3) ON CONFLICT(deck_id,question_id) DO UPDATE SET data=$3",
        [deckId, item.question.id, progress],
      );
      await db.query(
        "INSERT INTO progress_baselines(deck_id,question_id,epoch,revision,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(deck_id,question_id) DO UPDATE SET epoch=$3,revision=$4,data=$5",
        [deckId, item.question.id, epoch, item.revision, progress],
      );
    }
    for (const row of (
      await db.query("SELECT id,data FROM sessions WHERE deck_id=$1", [deckId])
    ).rows)
      await db.query(
        "UPDATE sessions SET data=$2,updated_at=now() WHERE id=$1",
        [row.id, closeResetSession(row.data as Session)],
      );
    await db.query("UPDATE attempts SET invalidated=true WHERE deck_id=$1", [
      deckId,
    ]);
    await db.query("UPDATE decks SET learning_epoch=$2 WHERE id=$1", [
      deckId,
      epoch,
    ]);
    await db.query(
      "INSERT INTO progress_receipts(id,deck_id,request_hash,result) VALUES($1,$2,$3,$4)",
      [input.requestId, deckId, hash, result],
    );
    return result;
  });
}

/** Replay current-generation evidence in study-time order, independent of upload order. */
export async function reconcileProgress(
  db: DB,
  deckId: string,
  item: Item,
  epoch: number,
) {
  const baseline = (
    await db.query(
      "SELECT data FROM progress_baselines WHERE deck_id=$1 AND question_id=$2 AND epoch=$3 AND revision=$4",
      [deckId, item.question.id, epoch, item.revision],
    )
  ).rows[0];
  let progress = baseline?.data ?? emptyProgress();
  const rows = (
    await db.query(
      `SELECT a.data FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE a.deck_id=$1 AND a.question_id=$2 AND a.revision=$3 AND NOT a.invalidated AND COALESCE((s.data->>'learningEpoch')::integer,0)=$4 ORDER BY a.data->>'at',a.session_id,a.ordinal`,
      [deckId, item.question.id, item.revision, epoch],
    )
  ).rows;
  for (const { data: a } of rows)
    if (typeof a.correct === "boolean")
      progress = updateProgress(
        progress,
        a.correct,
        a.format,
        a.selfAssessed,
        new Date(a.at),
        a.rating,
        a.skill,
        a.hintUsed,
        recallDirection(item.question, a.variantId),
      );
  item.progress = progress;
  await db.query(
    "INSERT INTO progress(deck_id,question_id,data) VALUES($1,$2,$3) ON CONFLICT(deck_id,question_id) DO UPDATE SET data=$3",
    [deckId, item.question.id, progress],
  );
}
