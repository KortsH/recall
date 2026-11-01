import React, { useState } from "react";
import {
  Check,
  ChevronDown,
  GripVertical,
  Link2,
  LockKeyhole,
  Pencil,
  Plus,
} from "lucide-react";
import type { Item, Question } from "../core/types.ts";
import { prerequisiteStatus } from "../core/prerequisites.ts";

export function QuestionLibrary({
  items,
  topic,
  search,
  busy,
  onTopic,
  onEdit,
  onUpdate,
}: {
  items: Item[];
  topic: string;
  search: string;
  busy: boolean;
  onTopic: (topic: string) => void;
  onEdit: (item: Item) => void;
  onUpdate: (question: Question, message: string) => Promise<boolean>;
}) {
  const [draftTopics, setDraftTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dragging, setDragging] = useState("");
  const [over, setOver] = useState("");
  const [undo, setUndo] = useState<Question | null>(null);
  const topics = [
    ...new Set([...items.map((i) => i.question.topic), ...draftTopics]),
  ].sort();
  const states = new Map(prerequisiteStatus(items).map((s) => [s.id, s]));
  const byId = new Map(items.map((i) => [i.question.id, i]));
  const visible = items.filter(
    (i) =>
      (!topic || i.question.topic === topic) &&
      `${i.question.question} ${i.question.concept} ${i.question.topic} ${i.question.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const groups = topics.filter(
    (t) =>
      (!topic || t === topic) &&
      (!search || visible.some((i) => i.question.topic === t)),
  );
  async function drop(event: React.DragEvent, parent?: Item, group?: string) {
    event.preventDefault();
    event.stopPropagation();
    setOver("");
    setDragging("");
    const source = byId.get(
      event.dataTransfer.getData("application/x-recall-question"),
    );
    if (!source || busy || source.question.id === parent?.question.id) return;
    const q = source.question;
    if (parent && q.depends_on?.includes(parent.question.id)) return;
    const next = parent
      ? { ...q, depends_on: [...(q.depends_on ?? []), parent.question.id] }
      : { ...q, topic: group! };
    if (
      await onUpdate(
        next,
        parent
          ? `Prerequisite added: “${q.question}” now requires “${parent.question.question}”.`
          : `Moved question to ${group}.`,
      )
    )
      setUndo(q);
  }
  function addTopic(event: React.FormEvent) {
    event.preventDefault();
    const name = newTopic.trim();
    if (!name) return;
    setDraftTopics([...new Set([...draftTopics, name])]);
    setNewTopic("");
    setAdding(false);
    onTopic("");
  }
  return (
    <div className="library-organizer">
      <div className="topic-tabs" role="tablist" aria-label="Question topics">
        {["", ...topics].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={topic === t}
            onClick={() => onTopic(t)}
          >
            {t || "All topics"}
            <span>
              {t
                ? items.filter((i) => i.question.topic === t).length
                : items.length}
            </span>
          </button>
        ))}
        <button className="add-topic" onClick={() => setAdding(!adding)}>
          <Plus size={14} /> New topic
        </button>
      </div>
      {adding && (
        <form className="new-topic-form" onSubmit={addTopic}>
          <label>
            Topic name
            <input
              autoFocus
              maxLength={100}
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="e.g. Usage Control"
            />
          </label>
          <button className="button primary" disabled={!newTopic.trim()}>
            Create topic
          </button>
        </form>
      )}
      <div className="library-hint">
        <Link2 size={16} />
        <p>
          Drag a question onto its prerequisite. Drop on a topic heading to move
          it. On your phone, use <strong>Edit → Prerequisite questions</strong>.
        </p>
      </div>
      {undo && (
        <div className="library-undo">
          Organization updated.
          <button
            disabled={busy}
            onClick={async () => {
              if (
                await onUpdate(
                  {
                    ...byId.get(undo.id)!.question,
                    topic: undo.topic,
                    depends_on: undo.depends_on,
                  },
                  "Organization change undone.",
                )
              )
                setUndo(null);
            }}
          >
            Undo last change
          </button>
        </div>
      )}
      {groups.map((t) => {
        const qs = visible.filter((i) => i.question.topic === t),
          locked = qs.filter(
            (i) => !states.get(i.question.id)?.unlocked,
          ).length,
          closed = collapsed.includes(t);
        return (
          <section
            className={`library-topic ${over === `topic:${t}` ? "drop-target" : ""}`}
            key={t}
            aria-label={`${t} questions`}
          >
            <div
              className="library-topic-heading"
              onDragOver={(e) => {
                if (dragging) {
                  e.preventDefault();
                  setOver(`topic:${t}`);
                }
              }}
              onDragLeave={() => setOver("")}
              onDrop={(e) => void drop(e, undefined, t)}
            >
              <button
                aria-expanded={!closed}
                onClick={() =>
                  setCollapsed(
                    closed
                      ? collapsed.filter((x) => x !== t)
                      : [...collapsed, t],
                  )
                }
              >
                <ChevronDown className={closed ? "collapsed" : ""} size={18} />
                <h2>{t}</h2>
                <span>
                  {qs.length} questions{locked ? ` · ${locked} locked` : ""}
                </span>
              </button>
              <span className="topic-drop-label">Drop here to move</span>
            </div>
            {!closed && (
              <div className="question-list">
                {qs.map((i) => {
                  const state = states.get(i.question.id)!;
                  return (
                    <button
                      key={i.question.id}
                      disabled={busy}
                      className={`question-row ${over === i.question.id ? "drop-target" : ""} ${dragging === i.question.id ? "dragging" : ""}`}
                      draggable={!busy}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-recall-question",
                          i.question.id,
                        );
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(i.question.id);
                      }}
                      onDragEnd={() => {
                        setDragging("");
                        setOver("");
                      }}
                      onDragOver={(e) => {
                        if (dragging && dragging !== i.question.id) {
                          e.preventDefault();
                          e.stopPropagation();
                          setOver(i.question.id);
                        }
                      }}
                      onDragLeave={() => setOver("")}
                      onDrop={(e) => void drop(e, i)}
                      onClick={() => onEdit(i)}
                    >
                      <span className="question-grip" aria-hidden="true">
                        <GripVertical size={16} />
                      </span>
                      <span
                        className={`question-state ${i.progress.mastered ? "mastered" : i.progress.attempts ? "learning" : ""}`}
                      >
                        {!state.unlocked ? (
                          <LockKeyhole size={14} />
                        ) : i.progress.mastered ? (
                          <Check size={16} />
                        ) : (
                          <span />
                        )}
                      </span>
                      <div className="question-row-content">
                        <span className="row-topic">
                          {i.question.id}
                          <span>·</span>
                          {!state.unlocked
                            ? "Locked"
                            : i.progress.mastered
                              ? "Mastered"
                              : "Available"}
                        </span>
                        <h3>{i.question.question}</h3>
                        <p>{i.question.answer}</p>
                        {!!state.depends_on.length && (
                          <div className="dependency-chips">
                            <span>
                              <Link2 size={12} />
                              Requires
                            </span>
                            {state.depends_on.map((id) => (
                              <span
                                className={
                                  state.blockedBy.includes(id)
                                    ? "pending"
                                    : "ready"
                                }
                                key={id}
                                title={`${id}: ${byId.get(id)?.question.question ?? "Missing question"}`}
                              >
                                {byId.get(id)?.question.question ?? id}
                              </span>
                            ))}
                          </div>
                        )}
                        {over === i.question.id && (
                          <span className="drop-caption">
                            Make the dragged question depend on this one
                          </span>
                        )}
                      </div>
                      <Pencil size={16} />
                    </button>
                  );
                })}
                {!qs.length && (
                  <div className="empty-topic">
                    Drag a question onto this topic heading to save the group.
                    Topics organize questions; they do not create prerequisites.
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
      {!groups.length && (
        <div className="empty-state">
          <h2>No matching questions.</h2>
          <p>Try another topic or search.</p>
        </div>
      )}
    </div>
  );
}
