import React, { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  GripVertical,
  Link2,
  LockKeyhole,
  Pencil,
  Plus,
  List,
  Grid2X2,
  Grid3X3,
  Rows3,
  Lightbulb,
  Flag,
} from "lucide-react";
import type { Item, Question } from "../core/types.ts";
import { prerequisiteStatus } from "../core/prerequisites.ts";
import {
  filterQuestions,
  UNASSIGNED_TOPIC,
  isUnassigned,
  type TopicMove,
} from "../core/organization.ts";

type Layout = "list" | "grid2" | "grid3" | "compact";
const label = (topic: string) =>
  isUnassigned(topic) ? "Uncategorized" : topic;
function preferences(): { layout: Layout; sidebar: boolean } {
  try {
    const p = JSON.parse(
      window.localStorage.getItem("recall-library-view") ?? "{}",
    );
    return {
      layout: ["list", "grid2", "grid3", "compact"].includes(p.layout)
        ? p.layout
        : "list",
      sidebar: p.sidebar !== false,
    };
  } catch {
    return { layout: "list", sidebar: true };
  }
}

export function QuestionLibrary({
  items,
  topic,
  search,
  busy,
  onTopic,
  onEdit,
  onUpdate,
  onMove,
  onFlag,
}: {
  items: Item[];
  topic: string;
  search: string;
  busy: boolean;
  onTopic: (topic: string) => void;
  onEdit: (item: Item) => void;
  onUpdate: (question: Question, message: string) => Promise<boolean>;
  onMove?: (moves: TopicMove[], message: string) => Promise<boolean>;
  onFlag?: (item: Item) => void;
}) {
  const [prefs, setPrefs] = useState(preferences);
  const [draftTopics, setDraftTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string[]>([]);
  const [over, setOver] = useState("");
  const [undo, setUndo] = useState<Question | TopicMove[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState("all");
  const [difficulty, setDifficulty] = useState("");
  const [hints, setHints] = useState("all");
  const [sort, setSort] = useState("original");
  const [flagged, setFlagged] = useState("all");
  useEffect(() => {
    try {
      window.localStorage.setItem("recall-library-view", JSON.stringify(prefs));
    } catch {}
  }, [prefs]);
  useEffect(() => {
    setSelected([]);
  }, [topic, search, status, difficulty, hints, flagged]);
  const topics = [
    ...new Set([
      ...items.map((i) => i.question.topic),
      ...draftTopics,
      UNASSIGNED_TOPIC,
    ]),
  ].sort();
  const states = new Map(prerequisiteStatus(items).map((s) => [s.id, s]));
  const byId = new Map(items.map((i) => [i.question.id, i]));
  const visible = filterQuestions(items, {
    topic,
    search,
    status,
    difficulty,
    hints,
    sort,
    flagged,
  });
  const groups = topics.filter(
    (t) =>
      (!topic || t === topic) &&
      (!(
        search ||
        status !== "all" ||
        difficulty ||
        hints !== "all" ||
        flagged !== "all"
      ) ||
        visible.some((i) => i.question.topic === t)),
  );
  const sidebar = prefs.sidebar && (!topic || isUnassigned(topic));

  async function move(ids: string[], target: string) {
    const moves = ids
      .filter((id) => byId.has(id) && byId.get(id)!.question.topic !== target)
      .map((id) => ({
        id,
        topic: target,
        fromTopic: byId.get(id)!.question.topic,
      }));
    if (!moves.length || busy) return;
    const message = `Moved ${moves.length} question${moves.length === 1 ? "" : "s"} to ${label(target)}.`;
    const saved = onMove
      ? await onMove(moves, message)
      : moves.length === 1 &&
        (await onUpdate(
          { ...byId.get(moves[0].id)!.question, topic: target },
          message,
        ));
    if (saved) {
      setUndo(
        moves.map((m) => ({
          id: m.id,
          topic: m.fromTopic!,
          fromTopic: m.topic,
        })),
      );
      setSelected([]);
    }
  }
  async function drop(event: React.DragEvent, parent?: Item, group?: string) {
    event.preventDefault();
    event.stopPropagation();
    setOver("");
    setDragging([]);
    let ids: string[];
    try {
      ids = JSON.parse(
        event.dataTransfer.getData("application/x-recall-questions"),
      );
    } catch {
      ids = [event.dataTransfer.getData("application/x-recall-question")];
    }
    if (!Array.isArray(ids) || busy) return;
    if (!parent) {
      await move(ids, group!);
      return;
    }
    if (ids.length !== 1) return;
    const source = byId.get(ids[0]);
    if (
      !source ||
      source.question.id === parent.question.id ||
      source.question.depends_on?.includes(parent.question.id)
    )
      return;
    if (
      await onUpdate(
        {
          ...source.question,
          depends_on: [
            ...(source.question.depends_on ?? []),
            parent.question.id,
          ],
        },
        `Prerequisite added: “${source.question.question}” now requires “${parent.question.question}”.`,
      )
    )
      setUndo(source.question);
  }
  async function undoChange() {
    if (!undo || busy) return;
    if (Array.isArray(undo)) {
      const saved = onMove
        ? await onMove(undo, "Organization change undone.")
        : undo.length === 1 &&
          byId.has(undo[0].id) &&
          (await onUpdate(
            { ...byId.get(undo[0].id)!.question, topic: undo[0].topic },
            "Organization change undone.",
          ));
      if (saved) setUndo(null);
    } else if (
      byId.has(undo.id) &&
      (await onUpdate(
        { ...byId.get(undo.id)!.question, depends_on: undo.depends_on },
        "Organization change undone.",
      ))
    )
      setUndo(null);
  }
  function addTopic(event: React.FormEvent) {
    event.preventDefault();
    const name = newTopic.trim();
    if (!name) return;
    setDraftTopics([...new Set([...draftTopics, name])]);
    setDestination(name);
    setNewTopic("");
    setAdding(false);
    onTopic("");
  }
  function renderGroup(t: string, aside = false) {
    const qs = visible.filter((i) => i.question.topic === t),
      locked = qs.filter((i) => !states.get(i.question.id)?.unlocked).length,
      closed = collapsed.includes(t);
    return (
      <section
        className={`library-topic ${aside ? "uncategorized-topic" : ""} ${over === `topic:${t}` ? "drop-target" : ""}`}
        key={t}
        aria-label={`${t} questions`}
        onDragOver={(e) => {
          if (dragging.length && e.target === e.currentTarget) {
            e.preventDefault();
            setOver(`topic:${t}`);
          }
        }}
        onDrop={(e) => void drop(e, undefined, t)}
      >
        <div
          className="library-topic-heading"
          onDragOver={(e) => {
            if (dragging.length) {
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
                closed ? collapsed.filter((x) => x !== t) : [...collapsed, t],
              )
            }
          >
            <ChevronDown className={closed ? "collapsed" : ""} size={18} />
            <h2>{label(t)}</h2>
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
                <div
                  key={i.question.id}
                  className={`library-entry ${selected.includes(i.question.id) ? "selected" : ""}`}
                  draggable={!busy}
                  onDragStart={(e) => {
                    const ids = selected.includes(i.question.id)
                      ? selected
                      : [i.question.id];
                    e.dataTransfer.setData(
                      "application/x-recall-question",
                      i.question.id,
                    );
                    e.dataTransfer.setData(
                      "application/x-recall-questions",
                      JSON.stringify(ids),
                    );
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(ids);
                  }}
                  onDragEnd={() => {
                    setDragging([]);
                    setOver("");
                  }}
                >
                  <input
                    type="checkbox"
                    className="question-select"
                    aria-label={`Select ${i.question.id}`}
                    checked={selected.includes(i.question.id)}
                    disabled={busy}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, i.question.id]
                          : selected.filter((id) => id !== i.question.id),
                      )
                    }
                  />
                  <button
                    disabled={busy}
                    className={`question-row ${over === i.question.id ? "drop-target" : ""} ${dragging.includes(i.question.id) ? "dragging" : ""}`}
                    onDragOver={(e) => {
                      if (
                        dragging.length === 1 &&
                        !dragging.includes(i.question.id)
                      ) {
                        e.preventDefault();
                        e.stopPropagation();
                        setOver(i.question.id);
                      }
                    }}
                    onDragLeave={() => setOver("")}
                    onDrop={(e) => {
                      if (dragging.length > 1) void drop(e, undefined, t);
                      else void drop(e, i);
                    }}
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
                        {i.question.flag
                          ? "Flagged"
                          : !state.unlocked
                            ? "Locked"
                            : i.progress.mastered
                              ? "Mastered"
                              : "Available"}
                        <span>·</span>Level {i.question.difficulty}
                        {(i.question.hint ||
                          i.question.variants.some((v) => v.hint)) && (
                          <Lightbulb size={13} aria-label="Has hint" />
                        )}
                      </span>
                      <h3>{i.question.question}</h3>
                      <p>{i.question.answer}</p>
                      {i.question.flag && (
                        <p className="flag-note">
                          <Flag size={12} /> {i.question.flag.note}
                        </p>
                      )}
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
                  {onFlag && (
                    <button
                      className={`question-flag-button ${i.question.flag ? "flagged" : ""}`}
                      title={i.question.flag?.note ?? "Flag for review"}
                      aria-label={`${i.question.flag ? "Review flag" : "Flag"} ${i.question.id}`}
                      disabled={busy}
                      onClick={() => onFlag(i)}
                    >
                      <Flag size={15} />
                    </button>
                  )}
                </div>
              );
            })}
            {!qs.length && (
              <div className="empty-topic">
                Drop questions on this heading, or select questions and use
                Move. Topics organize questions; they do not create
                prerequisites.
              </div>
            )}
          </div>
        )}
      </section>
    );
  }
  return (
    <div className={`library-organizer layout-${prefs.layout}`}>
      <div className="library-view-toolbar">
        <div
          className="library-layouts"
          role="group"
          aria-label="Library layout"
        >
          {(
            [
              ["list", "Topic list", List],
              ["grid2", "2-column grid", Grid2X2],
              ["grid3", "3-column grid", Grid3X3],
              ["compact", "Compact list", Rows3],
            ] as const
          ).map(([id, name, Icon]) => (
            <button
              key={id}
              title={name}
              aria-label={name}
              aria-pressed={prefs.layout === id}
              onClick={() => setPrefs({ ...prefs, layout: id })}
            >
              <Icon size={18} />
              <span>{name}</span>
            </button>
          ))}
        </div>
        <label className="library-sidebar-toggle">
          <input
            type="checkbox"
            checked={prefs.sidebar}
            onChange={(e) => setPrefs({ ...prefs, sidebar: e.target.checked })}
          />
          Uncategorized sidebar
        </label>
      </div>
      <div className="topic-tabs" role="tablist" aria-label="Question topics">
        {["", ...topics].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={topic === t}
            onClick={() => onTopic(t)}
          >
            {t ? label(t) : "All topics"}
            <span>
              {t
                ? items.filter((i) => i.question.topic === t).length
                : items.length}
            </span>
          </button>
        ))}
        <button className="add-topic" onClick={() => setAdding(!adding)}>
          <Plus size={14} />
          New topic
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
      <div className="library-filters">
        <label>
          Flags
          <select
            aria-label="Filter by flags"
            value={flagged}
            onChange={(e) => setFlagged(e.target.value)}
          >
            <option value="all">All questions</option>
            <option value="with">Flagged for review</option>
            <option value="without">Not flagged</option>
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by learning status"
          >
            <option value="all">Any status</option>
            <option value="unseen">Unseen</option>
            <option value="learning">Learning</option>
            <option value="mastered">Mastered</option>
            <option value="locked">Locked</option>
            <option value="available">Available</option>
          </select>
        </label>
        <label>
          Difficulty
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            aria-label="Filter by difficulty"
          >
            <option value="">Any level</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                Level {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hints
          <select
            value={hints}
            onChange={(e) => setHints(e.target.value)}
            aria-label="Filter by hints"
          >
            <option value="all">Any</option>
            <option value="with">With a hint</option>
            <option value="without">Without hints</option>
          </select>
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort questions"
          >
            <option value="original">Bank order</option>
            <option value="prompt">Question A–Z</option>
            <option value="id">ID A–Z</option>
            <option value="difficulty">Difficulty</option>
          </select>
        </label>
        <span className="library-visible-count" role="status">
          {visible.length} of {items.length} questions
        </span>
        <button
          className="text-button"
          onClick={() => {
            setStatus("all");
            setDifficulty("");
            setHints("all");
            setFlagged("all");
            onTopic("");
          }}
        >
          Clear filters
        </button>
      </div>
      <div className="library-selection-bar">
        <label>
          <input
            type="checkbox"
            disabled={!visible.length || busy}
            checked={
              !!visible.length &&
              visible.every((i) => selected.includes(i.question.id))
            }
            onChange={(e) =>
              setSelected(
                e.target.checked ? visible.map((i) => i.question.id) : [],
              )
            }
          />
          Select visible
        </label>
        <span>{selected.length} selected</span>
        <select
          aria-label="Move selected questions to topic"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          <option value="">Move to topic…</option>
          {topics.map((t) => (
            <option value={t} key={t}>
              {label(t)}
            </option>
          ))}
        </select>
        <button
          className="button secondary"
          disabled={busy || !selected.length || !destination}
          onClick={() => void move(selected, destination)}
        >
          Move selected
        </button>
        {!!selected.length && (
          <button className="text-button" onClick={() => setSelected([])}>
            Clear selection
          </button>
        )}
      </div>
      <div className="library-hint">
        <Link2 size={16} />
        <p>
          Drag one question onto its prerequisite. Drag selected questions onto
          a topic heading to move them together. On your phone, select and move,
          or use <strong>Edit → Prerequisite questions</strong>.
        </p>
      </div>
      {undo && (
        <div className="library-undo">
          Organization updated.
          <button disabled={busy} onClick={() => void undoChange()}>
            Undo last change
          </button>
        </div>
      )}
      <div className={`library-workspace ${sidebar ? "has-sidebar" : ""}`}>
        <div className="library-topic-grid">
          {groups
            .filter((t) => !sidebar || !isUnassigned(t))
            .map((t) => renderGroup(t))}
          {!groups.length && (
            <div className="empty-state">
              <h2>No matching questions.</h2>
              <p>Try another topic or filter.</p>
            </div>
          )}
        </div>
        {sidebar && (
          <aside className="library-inbox" aria-label="Uncategorized questions">
            {renderGroup(UNASSIGNED_TOPIC, true)}
          </aside>
        )}
      </div>
    </div>
  );
}
