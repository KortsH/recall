import { variants } from "./questions.ts";
import type { Attempt, Item } from "./types.ts";

/** Explain known distractors after grading; never guess a relationship from similar prose. */
export function choiceConnections(
  attempt: Attempt,
  items: Item[],
): Attempt["confusedWith"] {
  if (
    attempt.correct !== false ||
    !["multiple_choice", "multiple_select"].includes(attempt.format)
  )
    return;
  const current = items.find((i) => i.question.id === attempt.questionId);
  if (
    !current ||
    current.archived ||
    current.question.flag ||
    current.revision !== attempt.revision
  )
    return;
  const variant =
    attempt.variantId === "learn-choice"
      ? { correct: [current.question.answer] }
      : variants(current.question).find((v) => v.id === attempt.variantId);
  if (!variant) return;
  const correct = variant.correct ?? [attempt.answer];
  const selected = Array.isArray(attempt.response)
    ? attempt.response
    : [attempt.response];
  const connections: NonNullable<Attempt["confusedWith"]> = [];
  for (const answer of new Set(selected)) {
    if (typeof answer !== "string" || correct.includes(answer)) continue;
    const questions: NonNullable<Attempt["confusedWith"]>[number]["questions"] =
      [];
    for (const item of items) {
      if (
        item.archived ||
        item.question.flag ||
        item.question.id === attempt.questionId
      )
        continue;
      for (const v of variants(item.question)) {
        if (
          v.answer.trim() !== answer.trim() ||
          questions.some(
            (q) =>
              q.questionId === item.question.id && q.question === v.question,
          )
        )
          continue;
        questions.push({
          questionId: item.question.id,
          variantId: v.id,
          question: v.question,
          topic: item.question.topic,
        });
      }
    }
    if (questions.length) connections.push({ answer, questions });
  }
  return connections.length ? connections : undefined;
}
