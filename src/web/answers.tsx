import React from "react";
import { tr, useLanguage } from "./i18n.ts";
import type { Attempt } from "../core/types.ts";

export function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join("; ");
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(([left, right]) => `${left} → ${String(right)}`)
      .join("\n");
  return "";
}
export function SubmittedAnswer({
  value,
  mental = false,
  connections,
}: {
  value: unknown;
  mental?: boolean;
  connections?: Attempt["confusedWith"];
}) {
  useLanguage();
  if (mental) return null;
  const text = responseText(value);
  return (
    <div className="submitted-answer">
      <span className="eyebrow">{tr("app.your_answer")}</span>
      <p>{text.trim() ? text : tr("study.no_written_answer")}</p>
      {connections?.map((connection) => (
        <div className="choice-connection" key={connection.answer}>
          {connections.length > 1 && (
            <p className="choice-connection-answer">{connection.answer}</p>
          )}
          <span>{tr("study.answer_belongs_to")}</span>
          <ul>
            {connection.questions.slice(0, 2).map((q) => (
              <li key={`${q.questionId}:${q.variantId}`}>{q.question}</li>
            ))}
          </ul>
          {connection.questions.length > 2 && (
            <details>
              <summary>
                {tr("study.more_connections", {
                  count: connection.questions.length - 2,
                })}
              </summary>
              <ul>
                {connection.questions.slice(2).map((q) => (
                  <li key={`${q.questionId}:${q.variantId}`}>{q.question}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

export function AnswerComparison({
  value,
  mental = false,
  answer,
  connections,
  correct,
}: {
  value: unknown;
  mental?: boolean;
  answer: string;
  connections?: Attempt["confusedWith"];
  correct?: boolean | null;
}) {
  useLanguage();
  const modelOnly = mental || correct === true;
  return (
    <div className={`answer-comparison${modelOnly ? " model-only" : ""}`}>
      {!modelOnly && (
        <SubmittedAnswer
          value={value}
          mental={mental}
          connections={connections}
        />
      )}
      <div className="model-answer">
        <span className="eyebrow">{tr("app.model_answer")}</span>
        <p>{answer}</p>
      </div>
    </div>
  );
}
