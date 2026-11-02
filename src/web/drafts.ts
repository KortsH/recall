export interface DraftCard {
  id: string;
  deckId: string;
  cursor: number;
  version: number;
  card: { questionId: string; revision: number; variantId?: string } | null;
}
export interface AnswerDraft {
  sessionId: string;
  deckId: string;
  questionId: string;
  cursor: number;
  revision: number;
  variantId?: string;
  version: number;
  response: string;
  selected: string[];
  pairs: Record<string, string>;
  reveal?: {
    version: number;
    answer: string;
    explanation: string;
    rubric: string[];
  };
}
const key = (personal: boolean) =>
  `recall-answer-draft-${personal ? "personal" : "server"}`;
export function saveAnswerDraft(
  personal: boolean,
  session: DraftCard,
  value: Pick<AnswerDraft, "response" | "selected" | "pairs" | "reveal">,
  storage: Storage = localStorage,
) {
  if (!session.card) return;
  const draft: AnswerDraft = {
    ...value,
    sessionId: session.id,
    deckId: session.deckId,
    cursor: session.cursor,
    revision: session.card.revision,
    variantId: session.card.variantId,
    questionId: session.card.questionId,
    version: session.version,
  };
  // Failure is intentional: callers must not reload or destroy the view if saving failed.
  storage.setItem(key(personal), JSON.stringify(draft));
}
export function readAnswerDraft(
  personal: boolean,
  session: DraftCard,
  storage: Storage = localStorage,
): AnswerDraft | null {
  try {
    const d = JSON.parse(
      storage.getItem(key(personal)) ?? "null",
    ) as AnswerDraft | null;
    if (
      !d ||
      !session.card ||
      d.sessionId !== session.id ||
      d.deckId !== session.deckId ||
      d.cursor !== session.cursor ||
      d.questionId !== session.card.questionId ||
      d.revision !== session.card.revision ||
      d.variantId !== session.card.variantId ||
      typeof d.response !== "string" ||
      !Array.isArray(d.selected) ||
      !d.selected.every((v) => typeof v === "string") ||
      !d.pairs ||
      Array.isArray(d.pairs) ||
      Object.values(d.pairs).some((v) => typeof v !== "string")
    )
      return null;
    if (
      d.reveal &&
      (d.version !== session.version ||
        typeof d.reveal.answer !== "string" ||
        typeof d.reveal.explanation !== "string" ||
        !Array.isArray(d.reveal.rubric) ||
        !d.reveal.rubric.every((v) => typeof v === "string"))
    )
      delete d.reveal;
    return d;
  } catch {
    return null;
  }
}
export function clearAnswerDraft(
  personal: boolean,
  session: DraftCard,
  storage: Storage = localStorage,
) {
  try {
    if (readAnswerDraft(personal, session, storage))
      storage.removeItem(key(personal));
  } catch {}
}
