import { randomUUID, createHash } from "node:crypto";
import type pg from "pg";
import { contentHash, parseBank, resolveVariant } from "../core/bank.ts";
import {
  buildQueue,
  enqueueRetry,
  grade,
  publicCard,
  updateProgress,
} from "../core/engine.ts";
import {
  emptyProgress,
  type Bank,
  type Item,
  type Question,
  type Session,
  type Attempt,
} from "../core/types.ts";
import { transaction, type DB } from "./db.ts";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const requireValue = <T>(value: T | undefined | null, message: string): T => {
  if (value == null) throw new AppError(message, 404);
  return value;
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "deck";
export interface DeckSummary {
  id: string;
  name: string;
  description: string;
  created_at: string;
  stats: ReturnType<Store["statsFor"]>;
}
export class Store {
  constructor(public pool: pg.Pool) {}
  async items(deckId: string, db: DB = this.pool): Promise<Item[]> {
    const { rows } = await db.query(
      "SELECT q.data, q.revision, p.data AS progress FROM questions q LEFT JOIN progress p ON p.deck_id=q.deck_id AND p.question_id=q.id WHERE q.deck_id=$1 ORDER BY q.id",
      [deckId],
    );
    return rows.map((r) => ({
      question: r.data,
      revision: r.revision,
      progress: r.progress ?? emptyProgress(),
    }));
  }
  async decks(): Promise<DeckSummary[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM decks ORDER BY created_at",
    );
    return Promise.all(
      rows.map(async (d) => ({
        id: d.id as string,
        name: d.name as string,
        description: d.description as string,
        created_at: d.created_at as string,
        stats: this.statsFor(await this.items(d.id)),
      })),
    );
  }
  statsFor(items: Item[]) {
    const topics = [...new Set(items.map((i) => i.question.topic))].map(
      (topic) => {
        const group = items.filter((i) => i.question.topic === topic);
        const attempts = group.reduce((n, i) => n + i.progress.attempts, 0);
        const correct = group.reduce((n, i) => n + i.progress.correct, 0);
        return {
          topic,
          total: group.length,
          mastered: group.filter((i) => i.progress.mastered).length,
          attempts,
          accuracy: attempts ? Math.round((correct / attempts) * 100) : null,
        };
      },
    );
    const mastered = items.filter((i) => i.progress.mastered).length;
    const unseen = items.filter((i) => !i.progress.attempts).length;
    return {
      total: items.length,
      mastered,
      unseen,
      learning: items.length - mastered - unseen,
      due: items.filter(
        (i) =>
          i.progress.nextReview &&
          Date.parse(i.progress.nextReview) <= Date.now(),
      ).length,
      attempts: items.reduce((n, i) => n + i.progress.attempts, 0),
      topics,
      weak: items
        .filter((i) => i.progress.wrong > 0)
        .sort((a, b) => b.progress.wrong - a.progress.wrong)
        .slice(0, 10)
        .map((i) => ({
          id: i.question.id,
          question: i.question.question,
          topic: i.question.topic,
          wrong: i.progress.wrong,
        })),
    };
  }
  async deck(id: string): Promise<DeckSummary> {
    const { rows } = await this.pool.query(
      "SELECT * FROM decks WHERE id=$1 OR name=$1",
      [id],
    );
    const deck = requireValue(rows[0], "Deck not found");
    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      created_at: deck.created_at,
      stats: this.statsFor(await this.items(deck.id)),
    };
  }
  async importBank(bank: Bank) {
    return transaction(this.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [bank.deck]);
      let { rows } = await db.query("SELECT * FROM decks WHERE name=$1", [
        bank.deck,
      ]);
      let deck = rows[0];
      if (!deck) {
        const id = slug(bank.deck) + "-" + randomUUID().slice(0, 6);
        deck = (
          await db.query(
            "INSERT INTO decks(id,name,description) VALUES($1,$2,$3) RETURNING *",
            [id, bank.deck, bank.description],
          )
        ).rows[0];
      } else if (bank.description)
        await db.query("UPDATE decks SET description=$2 WHERE id=$1", [
          deck.id,
          bank.description,
        ]);
      const counts = {
        created: 0,
        updated: 0,
        unchanged: 0,
        reviewReset: 0,
        deckId: deck.id as string,
      };
      for (const q of bank.questions) {
        const result = await this.saveQuestion(db, deck.id, q);
        counts[result.kind]++;
        if (result.reset) counts.reviewReset++;
      }
      return counts;
    });
  }
  private async saveQuestion(db: DB, deckId: string, q: Question) {
    const { rows } = await db.query(
      "SELECT * FROM questions WHERE deck_id=$1 AND id=$2 FOR UPDATE",
      [deckId, q.id],
    );
    const old = rows[0];
    const hash = contentHash(q);
    if (old && JSON.stringify(old.data) === JSON.stringify(q))
      return { kind: "unchanged" as const, reset: false };
    // JSONB key order is not significant.
    if (
      old &&
      (await db.query("SELECT $1::jsonb=$2::jsonb AS same", [old.data, q]))
        .rows[0].same
    )
      return { kind: "unchanged" as const, reset: false };
    const reset = !!old && old.content_hash !== hash;
    await db.query(
      `INSERT INTO questions(deck_id,id,data,content_hash) VALUES($1,$2,$3,$4) ON CONFLICT(deck_id,id) DO UPDATE SET data=$3, content_hash=$4, revision=questions.revision+$5, updated_at=now()`,
      [deckId, q.id, q, hash, reset ? 1 : 0],
    );
    if (reset) {
      await db.query(
        "DELETE FROM progress WHERE deck_id=$1 AND question_id=$2",
        [deckId, q.id],
      );
      await db.query(
        "UPDATE attempts SET invalidated=true WHERE deck_id=$1 AND question_id=$2",
        [deckId, q.id],
      );
    }
    return { kind: old ? ("updated" as const) : ("created" as const), reset };
  }
  async question(deckId: string, id: string) {
    return requireValue(
      (await this.items(deckId)).find((i) => i.question.id === id),
      "Question not found",
    );
  }
  async editQuestion(
    deckId: string,
    id: string,
    input: unknown,
    revision: number,
  ) {
    const q = parseBank({ deck: "edit", questions: [input] }).questions[0];
    if (q.id !== id) throw new AppError("Question IDs cannot be changed");
    return transaction(this.pool, async (db) => {
      const { rows } = await db.query(
        "SELECT revision FROM questions WHERE deck_id=$1 AND id=$2 FOR UPDATE",
        [deckId, id],
      );
      const current = requireValue(rows[0], "Question not found");
      if (current.revision !== revision)
        throw new AppError(
          "This question was edited elsewhere. Reload before saving.",
          409,
        );
      return this.saveQuestion(db, deckId, q);
    });
  }
  async exportBank(deckId: string): Promise<Bank> {
    const d = await this.deck(deckId);
    return {
      schemaVersion: 1,
      deck: d.name,
      description: d.description,
      questions: (await this.items(d.id)).map((i) => i.question),
    };
  }
  async createSession(
    deckId: string,
    options: {
      mode?: string;
      topic?: string;
      count?: number;
      minutes?: number;
    },
  ) {
    await this.deck(deckId);
    const mode = options.mode ?? "learn";
    if (!["learn", "cram", "flashcards", "test"].includes(mode))
      throw new AppError("Unknown study mode");
    const count = options.count ?? 20;
    const minutes = options.minutes ?? 0;
    if (!Number.isInteger(count) || count < 1 || count > 200)
      throw new AppError("Choose 1–200 questions");
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 240)
      throw new AppError("Time limit must be 0–240 minutes");
    const items = (await this.items(deckId)).filter(
      (i) => !options.topic || i.question.topic === options.topic,
    );
    const queue = buildQueue(items, mode, count);
    if (!queue.length)
      throw new AppError(
        mode === "learn"
          ? "Everything in this selection is up to date. Try Cram to keep practising."
          : "No questions in this selection",
      );
    const session: Session = {
      id: randomUUID(),
      deckId,
      mode: mode as Session["mode"],
      topic: options.topic ?? null,
      queue,
      cursor: 0,
      answers: [],
      createdAt: new Date().toISOString(),
      deadline:
        mode === "test" && minutes
          ? new Date(Date.now() + minutes * 60000).toISOString()
          : null,
      finished: false,
      version: 0,
    };
    await this.pool.query(
      "INSERT INTO sessions(id,deck_id,data) VALUES($1,$2,$3)",
      [session.id, deckId, session],
    );
    return this.view(session);
  }
  async loadSession(
    id: string,
    db: DB = this.pool,
    lock = false,
  ): Promise<Session> {
    const { rows } = await db.query(
      `SELECT data FROM sessions WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    return requireValue(rows[0]?.data, "Session not found");
  }
  async saveSession(s: Session, db: DB) {
    s.version++;
    await db.query("UPDATE sessions SET data=$2,updated_at=now() WHERE id=$1", [
      s.id,
      s,
    ]);
  }
  async view(s: Session, db: DB = this.pool) {
    const items = await this.items(s.deckId, db);
    const current = s.queue[s.cursor];
    let card = null;
    if (current && !s.finished) {
      const item = items.find((i) => i.question.id === current.questionId);
      if (item) {
        const seed = createHash("sha256")
          .update(`${s.id}:${s.cursor}`)
          .digest()
          .readUInt32LE();
        let n = seed;
        card = publicCard(
          item,
          current,
          () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296,
        );
      }
    }
    const valid = s.answers.map((a, index) => ({
      ...a,
      index,
      outdated:
        items.find((i) => i.question.id === a.questionId)?.revision !==
        a.revision,
    }));
    const graded = valid.filter((a) => !a.outdated && a.correct !== null);
    const correct = graded.filter((a) => a.correct).length;
    const topics = [...new Set(valid.map((a) => a.topic))].map((topic) => {
      const a = graded.filter((a) => a.topic === topic);
      return {
        topic,
        correct: a.filter((x) => x.correct).length,
        total: a.length,
      };
    });
    return {
      id: s.id,
      deckId: s.deckId,
      mode: s.mode,
      topic: s.topic,
      cursor: s.cursor,
      total: s.queue.length,
      finished: s.finished,
      version: s.version,
      deadline: s.deadline,
      card,
      revealed: s.revealed?.cursor === s.cursor ? s.revealed : undefined,
      result: s.finished
        ? {
            answers: valid,
            correct,
            graded: graded.length,
            total: s.queue.length,
            pending: valid.filter((a) => a.correct === null && !a.outdated)
              .length,
            unanswered: s.queue.length - s.answers.length,
            topics,
          }
        : null,
    };
  }
  async getSession(id: string) {
    return transaction(this.pool, async (db) => {
      const s = await this.loadSession(id, db, true);
      if (!s.finished && s.deadline && Date.parse(s.deadline) <= Date.now()) {
        s.finished = true;
        await this.saveSession(s, db);
      }
      return this.view(s, db);
    });
  }
  async recentSessions(deckId: string) {
    const { rows } = await this.pool.query(
      "SELECT data FROM sessions WHERE deck_id=$1 ORDER BY updated_at DESC LIMIT 10",
      [deckId],
    );
    return rows.map((r) => ({
      id: r.data.id,
      mode: r.data.mode,
      cursor: r.data.cursor,
      total: r.data.queue.length,
      finished: r.data.finished,
      createdAt: r.data.createdAt,
    }));
  }
  private checkVersion(s: Session, version: number) {
    if (s.finished) throw new AppError("Session is finished", 409);
    if (s.version !== version)
      throw new AppError("Session changed. Reload to continue.", 409);
  }
  async reveal(
    id: string,
    input: { version: number; response: unknown; revision: number },
  ) {
    return transaction(this.pool, async (db) => {
      const s = await this.loadSession(id, db, true);
      this.checkVersion(s, input.version);
      if (s.mode === "test")
        throw new AppError("Answers are revealed after the test");
      const entry = s.queue[s.cursor];
      const item = requireValue(
        (await this.items(s.deckId, db)).find(
          (i) => i.question.id === entry.questionId,
        ),
        "Question not found",
      );
      if (item.revision !== input.revision)
        throw new AppError("Question changed. Reload this card.", 409);
      const v = requireValue(
        resolveVariant(item.question, entry.variantId),
        "Variant not found",
      );
      if (
        v.type !== "flashcard" &&
        !(v.type === "written" && !v.acceptedAnswers && !v.requiredParts)
      )
        throw new AppError("Submit this answer for automatic checking");
      s.revealed = { cursor: s.cursor, response: input.response };
      await this.saveSession(s, db);
      return {
        version: s.version,
        answer: v.answer,
        explanation: v.explanation ?? item.question.explanation,
        rubric: v.rubric ?? item.question.rubric ?? [],
      };
    });
  }
  async answer(
    id: string,
    input: {
      version: number;
      revision: number;
      response: unknown;
      rating?: string;
    },
  ) {
    return transaction(this.pool, async (db) => {
      const s = await this.loadSession(id, db, true);
      this.checkVersion(s, input.version);
      if (s.deadline && Date.parse(s.deadline) <= Date.now()) {
        s.finished = true;
        await this.saveSession(s, db);
        return { session: await this.view(s, db), feedback: null };
      }
      const entry = s.queue[s.cursor];
      // Lock the question so an edit and an answer cannot silently cross revisions.
      const row = (
        await db.query(
          "SELECT revision FROM questions WHERE deck_id=$1 AND id=$2 FOR UPDATE",
          [s.deckId, entry.questionId],
        )
      ).rows[0];
      if (!row || row.revision !== input.revision)
        throw new AppError("Question changed. Reload this card.", 409);
      const item = requireValue(
        (await this.items(s.deckId, db)).find(
          (i) => i.question.id === entry.questionId,
        ),
        "Question not found",
      );
      const v = requireValue(
        resolveVariant(item.question, entry.variantId),
        "Variant not found",
      );
      let response = input.response;
      let correct = grade(v, response);
      const selfAssessed = correct === null;
      if (selfAssessed && s.mode !== "test") {
        if (s.revealed?.cursor !== s.cursor)
          throw new AppError("Reveal the model answer before self-assessing");
        if (!["again", "hard", "good", "easy"].includes(input.rating ?? ""))
          throw new AppError("Choose Again, Hard, Good or Easy");
        response = s.revealed.response;
        correct = input.rating !== "again";
      }
      const attempt: Attempt = {
        questionId: item.question.id,
        variantId: v.id,
        format: v.type,
        response,
        correct,
        selfAssessed,
        rating: input.rating,
        revision: item.revision,
        question: v.question,
        answer: v.answer,
        explanation: v.explanation ?? item.question.explanation,
        topic: item.question.topic,
        rubric: v.rubric ?? item.question.rubric,
        at: new Date().toISOString(),
      };
      await db.query(
        "INSERT INTO attempts(session_id,ordinal,deck_id,question_id,revision,data) VALUES($1,$2,$3,$4,$5,$6)",
        [s.id, s.cursor, s.deckId, item.question.id, item.revision, attempt],
      );
      let progress = item.progress;
      if (correct !== null) {
        progress = updateProgress(
          progress,
          correct,
          v.type,
          selfAssessed,
          new Date(),
          input.rating,
        );
        await db.query(
          "INSERT INTO progress(deck_id,question_id,data) VALUES($1,$2,$3) ON CONFLICT(deck_id,question_id) DO UPDATE SET data=$3",
          [s.deckId, item.question.id, progress],
        );
      }
      if (s.mode === "learn" || s.mode === "cram") {
        // Follow up successful recognition with recall. Bound retries to keep sessions finite.
        if (entry.retry < 3 && (!correct || !progress.mastered))
          s.queue = enqueueRetry(s.queue, s.cursor, entry, {
            ...item,
            progress,
          });
      }
      s.answers.push(attempt);
      s.cursor++;
      delete s.revealed;
      s.finished = s.cursor >= s.queue.length;
      await this.saveSession(s, db);
      return {
        session: await this.view(s, db),
        feedback:
          s.mode === "test"
            ? null
            : { ...attempt, rubric: v.rubric ?? item.question.rubric ?? [] },
      };
    });
  }
  async finish(id: string, version: number) {
    return transaction(this.pool, async (db) => {
      const s = await this.loadSession(id, db, true);
      if (s.version !== version)
        throw new AppError("Session changed. Reload to continue.", 409);
      s.finished = true;
      await this.saveSession(s, db);
      return this.view(s, db);
    });
  }
  async rateTest(id: string, index: number, rating: string) {
    return transaction(this.pool, async (db) => {
      const s = await this.loadSession(id, db, true);
      if (!s.finished || s.mode !== "test")
        throw new AppError("Finish the test before reviewing answers");
      const a = s.answers[index];
      if (!a || a.correct !== null || !a.selfAssessed)
        throw new AppError("This answer has already been graded", 409);
      if (!["again", "hard", "good", "easy"].includes(rating))
        throw new AppError("Unknown rating");
      const locked = (
        await db.query(
          "SELECT revision FROM questions WHERE deck_id=$1 AND id=$2 FOR UPDATE",
          [s.deckId, a.questionId],
        )
      ).rows[0];
      if (!locked || locked.revision !== a.revision)
        throw new AppError(
          "This question changed; its old answer cannot count toward progress",
          409,
        );
      const item = requireValue(
        (await this.items(s.deckId, db)).find(
          (i) => i.question.id === a.questionId,
        ),
        "Question not found",
      );
      a.correct = rating !== "again";
      a.rating = rating;
      const p = updateProgress(
        item.progress,
        a.correct,
        a.format,
        true,
        new Date(),
        rating,
      );
      await db.query(
        "INSERT INTO progress(deck_id,question_id,data) VALUES($1,$2,$3) ON CONFLICT(deck_id,question_id) DO UPDATE SET data=$3",
        [s.deckId, a.questionId, p],
      );
      await db.query(
        "UPDATE attempts SET data=$3 WHERE session_id=$1 AND ordinal=$2",
        [s.id, index, a],
      );
      await this.saveSession(s, db);
      return this.view(s, db);
    });
  }
}
