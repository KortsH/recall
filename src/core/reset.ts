import { emptyProgress, type Item, type Session } from "./types.ts";

export function resetPreview(
  deckId: string,
  name: string,
  epoch: number,
  items: Item[],
  sessions: Session[],
) {
  return {
    deckId,
    name,
    expectedEpoch: epoch,
    questions: items.filter((i) => !i.archived).length,
    attempts: items.reduce((n, i) => n + i.progress.attempts, 0),
    mastered: items.filter((i) => i.progress.mastered).length,
    openSessions: sessions.filter((s) => !s.finished).length,
    dryRun: true,
  };
}
export function resetItems(items: Item[]): Item[] {
  return items.map((item) => ({ ...item, progress: emptyProgress() }));
}
/** Retain historical evidence, but it can never contribute to the new learning run. */
export function closeResetSession(session: Session): Session {
  const { revealed, hinted, ...rest } = session;
  return {
    ...rest,
    finished: true,
    learningReset: true,
    version: session.version + 1,
    answers: session.answers.map((a) => ({ ...a, invalidated: true })),
  };
}
