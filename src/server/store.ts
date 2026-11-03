import {
  advanceSession,
  presentAttempt,
  sessionView,
  newSession,
  prepareSession,
  requestHint,
  revealAnswer,
} from "../core/study.ts";
import {
  prerequisiteStatus,
  prospectiveQuestions,
  validatePrerequisites,
} from "../core/prerequisites.ts";
import { randomUUID, createHash } from "node:crypto";
import {
  canonical,
  parseAuthoring,
  planAuthoring,
  type AuthoringResult,
} from "../core/authoring.ts";
import type pg from "pg";
import { contentHash, parseBank, resolveVariant } from "../core/bank.ts";
import { recallDirection } from "../core/questions.ts";
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
import { auditQuestions } from "../core/audit.ts";
import { resetPreview, closeResetSession } from "../core/reset.ts";
import {
  planOrganization,
  filterQuestions,
  type QuestionFilters,
  type OrganizationInput,
} from "../core/organization.ts";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
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
const sortKeys = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, sortKeys(x)]),
        )
      : v;
export interface DeckSummary {
  learning_epoch?: number;
  id: string;
  name: string;
  description: string;
  created_at: string;
  stats: ReturnType<Store["statsFor"]>;
}
export class Store {
  constructor(public pool: pg.Pool) {}
  async applyAuthoring(
    input: unknown,
    options: { dryRun?: boolean } = {},
  ): Promise<AuthoringResult> {
    const batch = parseAuthoring(input);
    const hash = createHash("sha256").update(canonical(batch)).digest("hex");
    return transaction(this.pool, async (db) => {
      if (batch.deck?.base === null)
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          batch.deck.value.name,
        ]);
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "recall-deck:" + batch.deckId,
      ]);
      const receipt = (
        await db.query("SELECT * FROM authoring_receipts WHERE id=$1", [
          batch.id,
        ])
      ).rows[0];
      if (receipt) {
        if (receipt.request_hash !== hash)
          throw new AppError(
            "Authoring request identity cannot be reused",
            409,
          );
        return receipt.result;
      }
      const row = (
        await db.query(
          "SELECT name,description FROM decks WHERE id=$1 FOR UPDATE",
          [batch.deckId],
        )
      ).rows[0];
      const items = row ? await this.items(batch.deckId, db, true) : [];
      const conflicts = planAuthoring(batch, items, row ?? null);
      if (conflicts.length) return { applied: false, conflicts, items };
      if (!row) {
        if (!batch.deck) throw new AppError("Destination deck is missing", 409);
        const collision = (
          await db.query(
            "SELECT id,name,description FROM decks WHERE name=$1",
            [batch.deck.value.name],
          )
        ).rows[0];
        if (collision)
          return {
            applied: false,
            conflicts: [
              {
                kind: "deck",
                id: batch.deckId,
                reason: "name-taken",
                base: null,
                local: batch.deck.value,
                server: {
                  name: collision.name,
                  description: collision.description,
                },
              },
            ],
            items,
          };
      }
      if (options.dryRun) return { applied: false, conflicts: [], items };
      if (!row) {
        await db.query(
          "INSERT INTO decks(id,name,description) VALUES($1,$2,$3)",
          [batch.deckId, batch.deck!.value.name, batch.deck!.value.description],
        );
      } else if (batch.deck)
        await db.query("UPDATE decks SET name=$2,description=$3 WHERE id=$1", [
          batch.deckId,
          batch.deck.value.name,
          batch.deck.value.description,
        ]);
      for (const change of batch.changes) {
        await this.saveQuestion(db, batch.deckId, change.value.question);
        if (change.value.archived)
          await db.query(
            "UPDATE questions SET archived_at=now() WHERE deck_id=$1 AND id=$2 AND archived_at IS NULL",
            [batch.deckId, change.id],
          );
      }
      const changed = new Set(batch.changes.map((c) => c.id));
      const result: AuthoringResult = {
        applied: true,
        conflicts: [],
        items: (await this.items(batch.deckId, db, true)).filter((i) =>
          changed.has(i.question.id),
        ),
      };
      await db.query(
        "INSERT INTO authoring_receipts(id,deck_id,request_hash,result) VALUES($1,$2,$3,$4)",
        [batch.id, batch.deckId, hash, result],
      );
      return result;
    });
  }
  async recoverSession(input: Session) {
    const { syncOfflineSession } = await import("./offline.ts");
    return syncOfflineSession(this, input);
  }
  async items(
    deckId: string,
    db: DB = this.pool,
    includeArchived = false,
  ): Promise<Item[]> {
    const { rows } = await db.query(
      `SELECT q.data, q.revision,q.archived_at, p.data AS progress FROM questions q LEFT JOIN progress p ON p.deck_id=q.deck_id AND p.question_id=q.id WHERE q.deck_id=$1 ${includeArchived ? "" : "AND q.archived_at IS NULL"} ORDER BY q.id`,
      [deckId],
    );
    return rows.map((r) => ({
      question: r.data,
      revision: r.revision,
      progress: r.progress ?? emptyProgress(),
      archived: !!r.archived_at,
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
        learning_epoch: d.learning_epoch as number,
        stats: this.statsFor(await this.items(d.id)),
      })),
    );
  }
  statsFor(items: Item[]) {
    const locked = new Set(
      prerequisiteStatus(items)
        .filter((s) => !s.unlocked)
        .map((s) => s.id),
    );
    const topics = [...new Set(items.map((i) => i.question.topic))].map(
      (topic) => {
        const group = items.filter((i) => i.question.topic === topic);
        const attempts = group.reduce((n, i) => n + i.progress.attempts, 0);
        const correct = group.reduce((n, i) => n + i.progress.correct, 0);
        return {
          topic,
          total: group.length,
          locked: group.filter((i) => locked.has(i.question.id)).length,
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
      locked: locked.size,
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
      concepts: auditQuestions(items.map((i) => i.question)).concepts.map(
        (c) => ({
          ...c,
          recallMastered: items.filter(
            (i) =>
              i.question.concept === c.concept &&
              (i.question.skill ?? "recall") === "recall" &&
              i.progress.mastered,
          ).length,
          applicationMastered: items.filter(
            (i) =>
              i.question.concept === c.concept &&
              i.question.skill === "application" &&
              i.progress.mastered,
          ).length,
        }),
      ),
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
      learning_epoch: deck.learning_epoch,
      stats: this.statsFor(await this.items(deck.id)),
    };
  }
  async previewImport(
    bank: Bank,
    options: { replace?: boolean; topic?: string } = {},
  ) {
    const row = (
      await this.pool.query("SELECT id FROM decks WHERE name=$1", [bank.deck])
    ).rows[0];
    const existing = row ? await this.items(row.id, this.pool, true) : [];
    validatePrerequisites(
      prospectiveQuestions(existing, bank.questions, options),
    );
    if (options.topic && bank.questions.some((q) => q.topic !== options.topic))
      throw new AppError(
        "All imported questions must match --topic for a scoped replacement",
      );
    const archiveIds = options.replace
      ? existing
          .filter(
            (i) =>
              !i.archived &&
              (!options.topic || i.question.topic === options.topic) &&
              !bank.questions.some((q) => q.id === i.question.id),
          )
          .map((i) => i.question.id)
      : [];
    const counts = {
      created: 0,
      updated: 0,
      unchanged: 0,
      reviewReset: 0,
      archived: archiveIds.length,
      archiveIds,
      deckId: row?.id ?? "",
      dryRun: true,
    };
    for (const q of bank.questions) {
      const old = existing.find((i) => i.question.id === q.id);
      if (!old) counts.created++;
      else if (
        JSON.stringify(sortKeys(old.question)) ===
          JSON.stringify(sortKeys(q)) &&
        !old.archived
      )
        counts.unchanged++;
      else {
        counts.updated++;
        if (contentHash(old.question) !== contentHash(q)) counts.reviewReset++;
      }
    }
    return counts;
  }
  async importBank(
    bank: Bank,
    options: { replace?: boolean; topic?: string; dryRun?: boolean } = {},
  ) {
    if (options.dryRun) return this.previewImport(bank, options);
    if (options.topic && bank.questions.some((q) => q.topic !== options.topic))
      throw new AppError(
        "All imported questions must match --topic for a scoped replacement",
      );
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
        archived: 0,
        archiveIds: [] as string[],
        dryRun: false,
        deckId: deck.id as string,
      };
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "recall-deck:" + deck.id,
      ]);
      validatePrerequisites(
        prospectiveQuestions(
          await this.items(deck.id, db),
          bank.questions,
          options,
        ),
      );
      for (const q of bank.questions) {
        const result = await this.saveQuestion(db, deck.id, q);
        counts[result.kind]++;
        if (result.reset) counts.reviewReset++;
      }
      if (options.replace) {
        const removed = await db.query(
          `UPDATE questions SET archived_at=now() WHERE deck_id=$1 AND archived_at IS NULL AND NOT(id=ANY($2::text[])) ${options.topic ? "AND data->>'topic'=$3" : ""} RETURNING id`,
          options.topic
            ? [deck.id, bank.questions.map((q) => q.id), options.topic]
            : [deck.id, bank.questions.map((q) => q.id)],
        );
        counts.archiveIds = removed.rows.map((r) => r.id);
        counts.archived = removed.rowCount ?? 0;
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
    if (
      old &&
      !old.archived_at &&
      JSON.stringify(old.data) === JSON.stringify(q)
    )
      return { kind: "unchanged" as const, reset: false };
    // JSONB key order is not significant.
    if (
      old &&
      !old.archived_at &&
      (await db.query("SELECT $1::jsonb=$2::jsonb AS same", [old.data, q]))
        .rows[0].same
    )
      return { kind: "unchanged" as const, reset: false };
    const reset = !!old && old.content_hash !== hash;
    await db.query(
      `INSERT INTO questions(deck_id,id,data,content_hash) VALUES($1,$2,$3,$4) ON CONFLICT(deck_id,id) DO UPDATE SET data=$3, content_hash=$4, revision=questions.revision+$5, archived_at=NULL,updated_at=now()`,
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
  async listQuestions(deckId: string, filters: QuestionFilters = {}) {
    return filterQuestions(
      await this.items(deckId, this.pool, filters.archived),
      filters,
    );
  }

  async audit(deckId: string) {
    return auditQuestions((await this.items(deckId)).map((i) => i.question));
  }
  async organizeQuestions(deckId: string, input: OrganizationInput) {
    await this.deck(deckId);
    return transaction(this.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "recall-deck:" + deckId,
      ]);
      const items = await this.items(deckId, db);
      const plan = planOrganization(items, input);
      if (!plan.dryRun)
        for (const change of plan.changes) {
          const item = items.find((i) => i.question.id === change.id)!;
          await this.saveQuestion(db, deckId, {
            ...item.question,
            topic: change.topic,
          });
        }
      return plan;
    });
  }
  async archiveQuestion(deckId: string, id: string, restore = false) {
    return transaction(this.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "recall-deck:" + deckId,
      ]);
      const items = await this.items(deckId, db, true);
      requireValue(
        items.find((i) => i.question.id === id),
        "Question not found",
      );
      validatePrerequisites(
        items
          .filter((i) => (i.question.id === id ? restore : !i.archived))
          .map((i) => i.question),
      );
      const result = await db.query(
        `UPDATE questions SET archived_at=${restore ? "NULL" : "now()"} WHERE deck_id=$1 AND id=$2 RETURNING id`,
        [deckId, id],
      );
      requireValue(result.rows[0], "Question not found");
      return { id, archived: !restore };
    });
  }
  async updateDeck(
    deckId: string,
    input: { name?: string; description?: string },
  ) {
    if (
      input.name !== undefined &&
      (!input.name.trim() || input.name.length > 200)
    )
      throw new AppError("Deck name must have 1–200 characters");
    await this.pool.query(
      "UPDATE decks SET name=COALESCE($2,name),description=COALESCE($3,description) WHERE id=$1",
      [deckId, input.name?.trim(), input.description],
    );
    return this.deck(deckId);
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
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "recall-deck:" + deckId,
      ]);
      validatePrerequisites(
        prospectiveQuestions(await this.items(deckId, db), [q]),
      );
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
      ignorePrerequisites?: boolean;
    },
  ) {
    return transaction(this.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "recall-sync:" + deckId,
      ]);
      const deck = await db.query(
        "SELECT learning_epoch FROM decks WHERE id=$1",
        [deckId],
      );
      requireValue(deck.rows[0], "Deck not found");
      const session = newSession(deckId, await this.items(deckId, db), options);
      session.learningEpoch = deck.rows[0].learning_epoch;
      await db.query("INSERT INTO sessions(id,deck_id,data) VALUES($1,$2,$3)", [
        session.id,
        deckId,
        session,
      ]);
      return this.view(session, db);
    });
  }
  async resetLearning(
    deckId: string,
    input: { confirm?: boolean; expectedEpoch?: number } = {},
  ) {
    return transaction(this.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "recall-sync:" + deckId,
      ]);
      const deck = requireValue(
        (await db.query("SELECT * FROM decks WHERE id=$1", [deckId])).rows[0],
        "Deck not found",
      );
      const items = await this.items(deckId, db, true);
      const sessions = (
        await db.query("SELECT data FROM sessions WHERE deck_id=$1", [deckId])
      ).rows.map((r) => r.data as Session);
      const preview = resetPreview(
        deckId,
        deck.name,
        deck.learning_epoch,
        items,
        sessions,
      );
      if (input.confirm !== true) return preview;
      if (input.expectedEpoch !== deck.learning_epoch)
        throw new AppError("Learning changed. Preview the reset again.", 409);
      await db.query("DELETE FROM progress WHERE deck_id=$1", [deckId]);
      await db.query("UPDATE attempts SET invalidated=true WHERE deck_id=$1", [
        deckId,
      ]);
      for (const session of sessions)
        await db.query(
          "UPDATE sessions SET data=$2,updated_at=now() WHERE id=$1",
          [session.id, closeResetSession(session)],
        );
      await db.query(
        "UPDATE decks SET learning_epoch=learning_epoch+1 WHERE id=$1",
        [deckId],
      );
      return {
        ...preview,
        dryRun: false,
        learningEpoch: deck.learning_epoch + 1,
      };
    });
  }
  async loadSession(
    id: string,
    db: DB = this.pool,
    lock = false,
  ): Promise<Session> {
    if (lock) {
      const row = requireValue(
        (await db.query("SELECT deck_id FROM sessions WHERE id=$1", [id]))
          .rows[0],
        "Session not found",
      );
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "recall-sync:" + row.deck_id,
      ]);
    }
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
    return sessionView(s, await this.items(s.deckId, db));
  }
  async getSession(id: string) {
    return transaction(this.pool, async (db) => {
      const s = await this.loadSession(id, db, true);
      const before = JSON.stringify(s);
      prepareSession(s, await this.items(s.deckId, db));
      if (JSON.stringify(s) !== before) await this.saveSession(s, db);
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
    if (s.learningReset)
      throw new AppError(
        "Learning was reset. Start a new session.",
        409,
        "LEARNING_RESET",
      );
    if (s.finished) throw new AppError("Session is finished", 409);
    if (s.version !== version)
      throw new AppError("Session changed. Reload to continue.", 409);
  }
  async reveal(
    id: string,
    input: {
      version: number;
      response: unknown;
      revision: number;
      mental?: boolean;
    },
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
      if (item.question.flag || item.revision !== input.revision)
        throw new AppError("Question changed. Reload this card.", 409);
      const shown = revealAnswer(s, item, input);
      await this.saveSession(s, db);
      return {
        ...shown,
        version: s.version,
      };
    });
  }
  async hint(id: string, input: { version: number; revision: number }) {
    return transaction(this.pool, async (db) => {
      const s = await this.loadSession(id, db, true);
      this.checkVersion(s, input.version);
      const item = requireValue(
        (await this.items(s.deckId, db)).find(
          (i) => i.question.id === s.queue[s.cursor]?.questionId,
        ),
        "Question not found",
      );
      const hint = requestHint(s, item, input);
      await this.saveSession(s, db);
      return { version: s.version, hint };
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
          "SELECT revision,archived_at FROM questions WHERE deck_id=$1 AND id=$2 FOR UPDATE",
          [s.deckId, entry.questionId],
        )
      ).rows[0];
      if (!row || row.archived_at || row.revision !== input.revision)
        throw new AppError("Question changed. Reload this card.", 409);
      const item = requireValue(
        (await this.items(s.deckId, db)).find(
          (i) => i.question.id === entry.questionId,
        ),
        "Question not found",
      );
      if (
        !(s.ignorePrerequisites && ["cram", "test"].includes(s.mode)) &&
        !prerequisiteStatus(await this.items(s.deckId, db)).find(
          (x) => x.id === item.question.id,
        )?.unlocked
      )
        throw new AppError(
          "Prerequisites changed. Reload the session and master the required questions first.",
          409,
        );
      const ordinal = s.cursor;
      const context = await this.items(s.deckId, db);
      const { attempt, progress } = advanceSession(s, item, input, context);
      await db.query(
        "INSERT INTO attempts(session_id,ordinal,deck_id,question_id,revision,data) VALUES($1,$2,$3,$4,$5,$6)",
        [s.id, ordinal, s.deckId, item.question.id, item.revision, attempt],
      );
      if (attempt.correct !== null)
        await db.query(
          "INSERT INTO progress(deck_id,question_id,data) VALUES($1,$2,$3) ON CONFLICT(deck_id,question_id) DO UPDATE SET data=$3",
          [s.deckId, item.question.id, progress],
        );
      await this.saveSession(s, db);
      return {
        session: await this.view(s, db),
        feedback:
          s.mode === "test"
            ? null
            : {
                ...presentAttempt(attempt, context),
                rubric: attempt.rubric ?? [],
              },
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
      if (s.learningReset)
        throw new AppError(
          "Learning was reset. Old answers cannot be graded.",
          409,
          "LEARNING_RESET",
        );
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
        a.skill,
        a.hintUsed,
        recallDirection(item.question, a.variantId),
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
