import React from "react";
import { tr, useLanguage } from "./i18n.ts";

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
}: {
  value: unknown;
  mental?: boolean;
}) {
  useLanguage();
  const text = responseText(value);
  return (
    <div className="submitted-answer">
      <span className="eyebrow">{tr("app.your_answer")}</span>
      <p>
        {text.trim()
          ? text
          : mental
            ? tr("study.answered_mentally")
            : tr("study.no_written_answer")}
      </p>
    </div>
  );
}
