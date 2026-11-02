import React, { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { tr, useLanguage, type MessageKey } from "./i18n.ts";
import {
  downloadStatus,
  exportPendingEdits,
  resolveEditConflict,
  refreshDownloads,
} from "./cache.ts";
import { saveJson } from "./files.ts";
import type { AuthoringConflict } from "../core/authoring.ts";
import { canonical } from "../core/authoring.ts";

function changedFields(conflict: AuthoringConflict) {
  const values = [conflict.base, conflict.local, conflict.server].map(
    (v) => (v as any)?.question ?? {},
  );
  return [...new Set(values.flatMap((v) => Object.keys(v)))].filter(
    (key) =>
      !["id", "question", "answer", "topic"].includes(key) &&
      (canonical(values[0][key]) !== canonical(values[1][key]) ||
        canonical(values[0][key]) !== canonical(values[2][key])),
  );
}
function Version({ value, fields }: { value: unknown; fields: string[] }) {
  if (!value || typeof value !== "object") return <p>{tr("edits.absent")}</p>;
  const data = value as any,
    question = data.question;
  return (
    <>
      {question ? (
        <>
          <small>
            {question.topic} · {question.id}
            {data.archived ? ` · ${tr("edits.archived")}` : ""}
          </small>
          <p>
            <strong>{question.question}</strong>
          </p>
          <p>{question.answer}</p>
        </>
      ) : (
        <>
          <p>
            <strong>{data.name}</strong>
          </p>
          <p>{data.description}</p>
        </>
      )}
      {question &&
        fields.map((field) => (
          <dl className="conflict-field" key={field}>
            <dt>{tr(`edits.field.${field}` as MessageKey)}</dt>
            <dd>
              {question[field] === undefined
                ? tr("edits.absent")
                : typeof question[field] === "string"
                  ? question[field]
                  : JSON.stringify(question[field], null, 2)}
            </dd>
          </dl>
        ))}
      <details>
        <summary>{tr("edits.allFields")}</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </>
  );
}
export function OfflineEdits({
  status,
  busy,
  run,
  changed,
  notice,
}: {
  status: ReturnType<typeof downloadStatus>;
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  changed: () => Promise<void>;
  notice: (message: string) => void;
}) {
  useLanguage();
  const conflict = status.editConflict;
  const [choices, setChoices] = useState<Record<string, "local" | "server">>(
    {},
  );
  const [deckName, setDeckName] = useState("");
  useEffect(() => {
    setChoices({});
    setDeckName("");
  }, [conflict?.batchId]);
  const key = (c: AuthoringConflict) => `${c.kind}:${c.id}`;
  const ready = conflict?.result.conflicts.every(
    (c) =>
      choices[key(c)] &&
      (c.reason !== "name-taken" ||
        choices[key(c)] === "server" ||
        (deckName.trim() && deckName.trim() !== (c.local as any)?.name)),
  );
  return (
    <section
      id="offline-edits"
      className="settings-card offline-edits"
      tabIndex={-1}
      aria-labelledby="offline-edits-title"
    >
      <h2 id="offline-edits-title">{tr("edits.title")}</h2>
      <p>{tr("edits.help")}</p>
      <p className="small">{tr("edits.publishRule")}</p>
      <p role="status">
        {status.pendingEdits
          ? tr("edits.pending", { count: status.pendingEdits })
          : tr("edits.none")}
      </p>
      <button
        className="button secondary"
        disabled={busy || !status.pendingEdits}
        onClick={() =>
          run(async () => {
            await refreshDownloads();
            await changed();
            notice(tr("app.downloaded_quizzes_are_up_to_date"));
          })
        }
      >
        <RefreshCw size={16} />
        {tr("app.sync_progress_refresh_quizzes")}
      </button>{" "}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            saveJson("Recall-pending.edits.json", await exportPendingEdits());
            notice(tr("edits.exported"));
          })
        }
      >
        <Download size={16} />
        {tr("edits.export")}
      </button>
      <p className="small">{tr("edits.exportHelp")}</p>
      {conflict && (
        <div
          className="edit-conflicts"
          id="edit-conflict-review"
          tabIndex={-1}
          role="region"
          aria-label={tr("edits.conflictsTitle")}
        >
          <h3>{tr("edits.conflictsTitle")}</h3>
          <p>{tr("edits.conflictsHelp")}</p>
          {conflict.result.conflicts.map((c) => (
            <fieldset key={key(c)} className="edit-conflict">
              <legend>{c.id}</legend>
              {c.reason === "name-taken" && <p>{tr("edits.nameTaken")}</p>}
              {c.reason === "graph" && <p>{tr("edits.graphConflict")}</p>}
              <div className="conflict-versions">
                <article>
                  <h4>{tr("edits.original")}</h4>
                  <Version value={c.base} fields={changedFields(c)} />
                </article>
                <article>
                  <h4>{tr("edits.local")}</h4>
                  <Version value={c.local} fields={changedFields(c)} />
                </article>
                <article>
                  <h4>{tr("edits.server")}</h4>
                  <Version value={c.server} fields={changedFields(c)} />
                </article>
              </div>
              <label className="storage-choice">
                <input
                  type="radio"
                  name={key(c)}
                  disabled={busy || c.local === null}
                  checked={choices[key(c)] === "local"}
                  onChange={() => setChoices({ ...choices, [key(c)]: "local" })}
                />
                {tr("edits.keepLocal")}
              </label>
              <label className="storage-choice">
                <input
                  type="radio"
                  name={key(c)}
                  disabled={busy}
                  checked={choices[key(c)] === "server"}
                  onChange={() =>
                    setChoices({ ...choices, [key(c)]: "server" })
                  }
                />
                {tr(
                  c.kind === "deck" && (!c.server || c.reason === "name-taken")
                    ? "edits.discardDeck"
                    : "edits.keepServer",
                )}
              </label>
              {c.reason === "name-taken" && choices[key(c)] === "local" && (
                <label className="field">
                  {tr("edits.newName")}
                  <input
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    maxLength={200}
                  />
                </label>
              )}
            </fieldset>
          ))}
          <button
            className="button primary"
            disabled={busy || !ready}
            onClick={() =>
              run(async () => {
                await resolveEditConflict(conflict.batchId, choices, deckName);
                await changed();
                notice(tr("edits.choicesSaved"));
              })
            }
          >
            <RefreshCw size={16} />
            {tr("edits.saveChoices")}
          </button>
        </div>
      )}
    </section>
  );
}
