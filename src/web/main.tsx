import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Layers,
  ChartNoAxesCombined,
  Settings2,
  Plus,
  Check,
  CheckCheck,
  X,
  RotateCcw,
  Flame,
  Keyboard,
  MoreHorizontal,
  Search,
  Pencil,
  Download,
  Upload,
  Play,
  Clock,
  ChevronDown,
  Command,
  GraduationCap,
  PanelLeftClose,
} from "lucide-react";
import type { Store } from "../server/store.ts";
import type { Question, Item, Attempt } from "../core/types.ts";
import "./style.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "./readability.css";
import {
  api,
  downloadedMode,
  setDownloadedMode,
  refreshDownloads,
  syncDownloads,
  downloadStatus,
} from "./cache.ts";

type Deck = Awaited<ReturnType<Store["decks"]>>[number];
type SessionView = Awaited<ReturnType<Store["getSession"]>>;
type Feedback = Attempt & { rubric?: string[] };
type Reveal = Awaited<ReturnType<Store["reveal"]>>;
const fmt = (s: string) => s.replaceAll("_", " ");
const modes = [
  {
    id: "learn",
    title: "Learn",
    copy: "Build understanding, one question at a time.",
    icon: BookOpen,
  },
  {
    id: "cram",
    title: "Cram",
    copy: "Focus on weak spots. Keep everything fresh.",
    icon: Flame,
  },
  {
    id: "flashcards",
    title: "Flashcards",
    copy: "Take a breath. Recall it in your own words.",
    icon: Layers,
  },
  {
    id: "test",
    title: "Test yourself",
    copy: "No hints. See what you really remember.",
    icon: GraduationCap,
  },
];
function App() {
  const [cache, setCache] = useState(downloadStatus());
  useEffect(() => {
    const update = () => setCache(downloadStatus());
    window.addEventListener("recall-cache", update);
    return () => window.removeEventListener("recall-cache", update);
  }, []);
  const [decks, setDecks] = useState<Deck[]>([]),
    [deckId, setDeckId] = useState(""),
    [section, setSection] = useState("overview");
  const [session, setSession] = useState<SessionView | null>(null),
    [recent, setRecent] = useState<any[]>([]);
  const [topic, setTopic] = useState(""),
    [count, setCount] = useState(20),
    [minutes, setMinutes] = useState(0),
    [mode, setMode] = useState("learn");
  const [items, setItems] = useState<Item[]>([]),
    [search, setSearch] = useState(""),
    [editor, setEditor] = useState<Item | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [importOpen, setImportOpen] = useState(false);
  const [response, setResponse] = useState<any>(""),
    [selected, setSelected] = useState<string[]>([]),
    [pairs, setPairs] = useState<Record<string, string>>({}),
    [feedback, setFeedback] = useState<Feedback | null>(null),
    [reveal, setReveal] = useState<Reveal | null>(null);
  const [now, setNow] = useState(Date.now()),
    [mobileNav, setMobileNav] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    mainRef = useRef<HTMLElement>(null);
  const deck = decks.find((d) => d.id === deckId);
  const refresh = async () => {
    const d = await api<Deck[]>("/decks");
    setDecks(d);
    if (!deckId && d[0]) setDeckId(d[0].id);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const id = localStorage.getItem("recall-session");
    if (id)
      void api<SessionView>(`/sessions/${id}`)
        .then((s) => {
          if (!s.finished) {
            setSession(s);
            setDeckId(s.deckId);
          }
        })
        .catch(() => localStorage.removeItem("recall-session"));
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [session?.id, session?.cursor, !!feedback, section]);
  useEffect(() => {
    setTopic("");
  }, [deckId]);
  useEffect(() => {
    if (!deckId) return;
    void Promise.all([
      api<Item[]>(`/decks/${deckId}/questions`),
      api<any[]>(`/decks/${deckId}/sessions`),
    ])
      .then(([i, s]) => {
        setItems(i);
        setRecent(s);
      })
      .catch((e) => setError(e.message));
  }, [deckId, session?.finished, section]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const resetAnswer = () => {
    setResponse("");
    setSelected([]);
    setPairs({});
    setFeedback(null);
    setReveal(null);
  };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const start = (chosen = mode) =>
    void run(async () => {
      const s = await api<SessionView>(`/decks/${deckId}/sessions`, {
        mode: chosen,
        topic: topic || undefined,
        count,
        minutes,
      });
      setNow(Date.now());
      setSession(s);
      setMode(chosen);
      resetAnswer();
      localStorage.setItem("recall-session", s.id);
    });
  const resume = (id: string) =>
    void run(async () => {
      const s = await api<SessionView>(`/sessions/${id}`);
      setNow(Date.now());
      setSession(s);
      setDeckId(s.deckId);
      resetAnswer();
      localStorage.setItem("recall-session", s.id);
    });
  const leave = () => {
    if (downloadedMode()) void syncDownloads().catch(() => {});
    setSession(null);
    resetAnswer();
    void refresh();
    setSection("overview");
  };
  const card = session?.card;
  const actualResponse = card?.options
    ? selected
    : card?.format === "matching"
      ? pairs
      : response;
  const canAnswer = card?.options
    ? selected.length > 0
    : card?.format === "matching"
      ? card.left?.every((x) => pairs[x])
      : card?.format === "flashcard" || String(response).trim().length > 0;
  const submit = (rating?: string) =>
    void run(async () => {
      if (!session || !card) return;
      if (card.selfGrade && session.mode !== "test" && !reveal) {
        const r = await api<Reveal>(`/sessions/${session.id}/reveal`, {
          version: session.version,
          revision: card.revision,
          response: actualResponse,
        });
        setReveal(r);
        setSession({ ...session, version: r.version });
        return;
      }
      const r = await api<{ session: SessionView; feedback: Feedback | null }>(
        `/sessions/${session.id}/answer`,
        {
          version: session.version,
          revision: card.revision,
          response: actualResponse,
          rating,
        },
      );
      setSession(r.session);
      if (r.feedback) setFeedback(r.feedback);
      else resetAnswer();
      void refresh();
    });
  const next = () => {
    resetAnswer();
    requestAnimationFrame(() => inputRef.current?.focus());
    mainRef.current?.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (!session?.deadline || session.finished) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.deadline, session?.finished]);
  useEffect(() => {
    if (
      !session?.deadline ||
      session.finished ||
      now < Date.parse(session.deadline)
    )
      return;
    void run(async () => {
      setSession(await api<SessionView>(`/sessions/${session.id}`));
      resetAnswer();
    });
  }, [now]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (editor || importOpen || !session) return;
      const target = e.target as HTMLElement;
      const typing = ["TEXTAREA", "INPUT", "SELECT"].includes(target.tagName);
      if (
        e.key === "Enter" &&
        (e.metaKey || e.ctrlKey) &&
        !feedback &&
        canAnswer
      ) {
        e.preventDefault();
        submit();
        return;
      }
      if (typing) return;
      if (e.key === "Enter" && feedback) {
        e.preventDefault();
        next();
      } else if (e.key === "Enter" && !busy && canAnswer && !reveal) {
        e.preventDefault();
        submit();
      } else if (
        card?.options &&
        !feedback &&
        !reveal &&
        /^[1-9]$/.test(e.key)
      ) {
        const option = card.options[Number(e.key) - 1];
        if (option) {
          e.preventDefault();
          setSelected((s) =>
            card.format === "multiple_select"
              ? s.includes(option)
                ? s.filter((x) => x !== option)
                : [...s, option]
              : [option],
          );
        }
      } else if (reveal && !feedback && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        submit(["again", "hard", "good", "easy"][Number(e.key) - 1]);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  });
  const edit = (id: string) =>
    void run(async () => {
      setEditor(
        await api<Item>(`/decks/${deckId}/questions/${encodeURIComponent(id)}`),
      );
    });
  const saveEdit = (question: Question) =>
    void run(async () => {
      if (!editor) return;
      const result = await api<{ reset: boolean }>(
        `/decks/${deckId}/questions/${editor.question.id}`,
        { question, revision: editor.revision },
        "PUT",
      );
      setEditor(null);
      setNotice(
        result.reset
          ? "Question corrected. Previous progress for this objective was reset."
          : "Question updated.",
      );
      setItems(await api<Item[]>(`/decks/${deckId}/questions`));
      if (session)
        setSession(await api<SessionView>(`/sessions/${session.id}`));
      if (feedback)
        setFeedback({
          ...feedback,
          explanation: result.reset
            ? "This question has been edited. Its previous attempt is excluded from progress."
            : (question.variants.find((v) => v.id === feedback.variantId)
                ?.explanation ?? question.explanation),
        });
      void refresh();
    });
  const exportDeck = () =>
    void run(async () => {
      const bank = await api(`/decks/${deckId}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(bank, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "recall-" + deckId + ".json";
      a.click();
      URL.revokeObjectURL(url);
    });
  const due = decks.reduce((n, d) => n + d.stats.due, 0),
    total = decks.reduce((n, d) => n + d.stats.total, 0);
  const visible = items.filter(
    (i) =>
      (!topic || i.question.topic === topic) &&
      `${i.question.question} ${i.question.concept} ${i.question.topic}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const inStudy = !!session;
  return (
    <div className={`app ${inStudy ? "studying" : ""}`}>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            leave();
          }}
        >
          <span className="brand-icon">
            r<span>•</span>
          </span>
          recall<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          YOUR STUDY SPACE <span>LOCAL</span>
        </div>
        <nav aria-label="Main navigation">
          {[
            { id: "overview", icon: BookOpen, label: "Overview" },
            { id: "library", icon: Layers, label: "Question library" },
            {
              id: "progress",
              icon: ChartNoAxesCombined,
              label: "Your progress",
            },
          ].map((n) => (
            <button
              key={n.id}
              className={`nav-item ${section === n.id && !inStudy ? "active" : ""}`}
              onClick={() => {
                setSession(null);
                setSection(n.id);
                setMobileNav(false);
                void refresh();
              }}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "library" && <span className="nav-count">{total}</span>}
            </button>
          ))}
        </nav>
        <div className="side-decks">
          <div className="side-label">
            YOUR DECKS
            <button
              aria-label="Import a deck"
              onClick={() => setImportOpen(true)}
            >
              <Plus size={15} />
            </button>
          </div>
          {decks.map((d, i) => (
            <button
              className={`deck-link ${d.id === deckId ? "selected" : ""}`}
              key={d.id}
              onClick={() => {
                setDeckId(d.id);
                setSession(null);
                setSection("overview");
                setMobileNav(false);
              }}
            >
              <span className={`deck-marker color-${i % 3}`} />
              <span>{d.name}</span>
              <span>{d.stats.total}</span>
            </button>
          ))}
          {!decks.length && (
            <p className="side-empty">Your next subject starts here.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="side-note">
            <span className="status-dot" /> A little practice. A lasting memory.
            <p>Private, local, and entirely yours.</p>
          </div>
          <button
            className="profile"
            onClick={() => {
              setSession(null);
              setSection("settings");
            }}
          >
            <span className="avatar">Y</span>
            <span>
              Your workspace<small>Made for learning</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <main ref={mainRef}>
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Toggle navigation"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <PanelLeftClose size={20} />
          </button>
          <div className="breadcrumb">
            Your workspace <span>/</span>{" "}
            <strong>
              {inStudy
                ? "Study session"
                : section === "overview"
                  ? "Overview"
                  : section === "library"
                    ? "Question library"
                    : section === "progress"
                      ? "Your progress"
                      : "Settings"}
            </strong>
          </div>
          <div className="local-badge">
            <span className="status-dot" />
            {cache.enabled
              ? `Downloaded on device${cache.pending ? ` · ${cache.pending} to sync` : ""}`
              : "Live server"}
            {cache.enabled && (
              <button
                className="icon-button"
                aria-label="Refresh downloaded quizzes"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await refreshDownloads();
                    await refresh();
                    if (deckId) {
                      setItems(await api<Item[]>(`/decks/${deckId}/questions`));
                      setRecent(await api<any[]>(`/decks/${deckId}/sessions`));
                    }
                    setNotice(
                      "Progress synced and downloaded quizzes refreshed.",
                    );
                  })
                }
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </header>
        {cache.error && (
          <div className="cache-status" role="status">
            {cache.error}
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            {session && (
              <button onClick={() => resume(session.id)}>Reload session</button>
            )}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <CheckCheck size={18} />
            {notice}
          </div>
        )}
        {!inStudy && (
          <div className="page">
            {section === "overview" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">MAKE IT SECOND NATURE</div>
                    <h1>
                      A little closer to
                      <br />
                      “I know this.”<span className="heading-spark">✦</span>
                    </h1>
                    <p>Turn what you’re studying into something that stays.</p>
                  </div>
                  <button
                    className="button secondary import-button"
                    onClick={() => setImportOpen(true)}
                  >
                    <Plus size={17} />
                    Add a deck
                  </button>
                </div>
                <div className="overview-stats">
                  <div>
                    <span className="stat-icon">
                      <Layers size={19} />
                    </span>
                    <span>
                      <strong>{total}</strong>
                      <small>Learning objectives</small>
                    </span>
                  </div>
                  <div>
                    <span className="stat-icon green">
                      <CheckCheck size={19} />
                    </span>
                    <span>
                      <strong>
                        {decks.reduce((n, d) => n + d.stats.mastered, 0)}
                        <em> / {total}</em>
                      </strong>
                      <small>Mastered through recall</small>
                    </span>
                  </div>
                  <div>
                    <span className="stat-icon orange">
                      <RotateCcw size={19} />
                    </span>
                    <span>
                      <strong>{due}</strong>
                      <small>Ready for a review</small>
                    </span>
                  </div>
                </div>
                {deck ? (
                  <>
                    <div className="section-heading">
                      <h2>Pick up where you left off</h2>
                      <span>
                        {decks.length} {decks.length === 1 ? "deck" : "decks"}{" "}
                        in your library
                      </span>
                    </div>
                    <section className="deck-card" aria-label={deck.name}>
                      <div className="deck-card-top">
                        <span className="subject-pill">
                          <span />
                          EXAM PREPARATION
                        </span>
                        <button
                          className="icon-button"
                          aria-label="View question library"
                          onClick={() => setSection("library")}
                        >
                          <MoreHorizontal size={22} />
                        </button>
                      </div>
                      <div className="deck-card-content">
                        <div>
                          <h2>{deck.name}</h2>
                          <p>
                            {deck.description ||
                              "Your next step toward confident recall."}
                          </p>
                          <div className="deck-meta">
                            <span>
                              <Layers size={15} />
                              {deck.stats.total} objectives
                            </span>
                            <i />
                            <span>{deck.stats.topics.length} topics</span>
                            <i />
                            <span>Recognition → recall → application</span>
                          </div>
                        </div>
                        <div
                          className="mastery-ring"
                          style={
                            {
                              "--progress": `${deck.stats.total ? (deck.stats.mastered / deck.stats.total) * 100 : 0}%`,
                            } as React.CSSProperties
                          }
                        >
                          <div>
                            <strong>
                              {Math.round(
                                (deck.stats.mastered /
                                  (deck.stats.total || 1)) *
                                  100,
                              )}
                              <small>%</small>
                            </strong>
                            <span>mastered</span>
                          </div>
                        </div>
                      </div>
                      <div className="deck-progress">
                        <span
                          style={{
                            width: `${(deck.stats.mastered / (deck.stats.total || 1)) * 100}%`,
                          }}
                        />
                        <span
                          style={{
                            width: `${(deck.stats.learning / (deck.stats.total || 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="deck-card-bottom">
                        <div className="progress-legend">
                          <span>
                            <i className="legend-mastered" />
                            {deck.stats.mastered} mastered
                          </span>
                          <span>
                            <i className="legend-learning" />
                            {deck.stats.learning} learning
                          </span>
                          <span>
                            <i />
                            {deck.stats.unseen} unseen
                          </span>
                        </div>
                        <button
                          className="text-button quick-start"
                          disabled={busy}
                          onClick={() => start("learn")}
                        >
                          Learn this deck
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </section>
                    <div className="section-heading mode-heading">
                      <h2>How do you want to practise?</h2>
                      <span>
                        Different ways in. The same deeper understanding.
                      </span>
                    </div>
                    <div className="mode-grid">
                      {modes.map((m) => (
                        <button
                          key={m.id}
                          className={`mode-card ${mode === m.id ? "chosen" : ""}`}
                          onClick={() => setMode(m.id)}
                        >
                          <div className="mode-card-top">
                            <span className={`mode-icon ${m.id}`}>
                              <m.icon size={22} />
                            </span>
                            <span className="mode-radio">
                              {mode === m.id && <span />}
                            </span>
                          </div>
                          <h3>
                            {m.title}
                            {m.id === "learn" && (
                              <span className="tiny-badge">ADAPTIVE</span>
                            )}
                          </h3>
                          <p>{m.copy}</p>
                        </button>
                      ))}
                    </div>
                    <div className="session-controls">
                      <label>
                        Topic
                        <select
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                        >
                          <option value="">All topics</option>
                          {deck.stats.topics.map((t) => (
                            <option key={t.topic}>{t.topic}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Session size
                        <select
                          value={count}
                          onChange={(e) => setCount(Number(e.target.value))}
                        >
                          {[5, 10, 20, 50, 100, 200].map((n) => (
                            <option value={n} key={n}>
                              {n} objectives
                            </option>
                          ))}
                        </select>
                      </label>
                      {mode === "test" && (
                        <label>
                          Time limit
                          <select
                            value={minutes}
                            onChange={(e) => setMinutes(Number(e.target.value))}
                          >
                            <option value={0}>Untimed</option>
                            {[5, 15, 30, 60].map((n) => (
                              <option value={n} key={n}>
                                {n} minutes
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <button
                        className="button primary start-button"
                        disabled={busy}
                        onClick={() => start()}
                      >
                        {busy
                          ? "Getting ready…"
                          : `Start ${mode === "test" ? "test" : mode === "flashcards" ? "flashcards" : mode === "cram" ? "cram session" : "learning"}`}
                        <ArrowRight size={18} />
                      </button>
                    </div>
                    <div className="learning-note">
                      <span>✦</span>
                      <p>
                        <strong>Knowing it is more than recognising it.</strong>{" "}
                        Learn gradually moves you from choosing an answer to
                        recalling it yourself.
                      </p>
                    </div>
                    {recent.some((s) => !s.finished) && (
                      <div className="resume-panel">
                        <div>
                          <Clock size={18} />
                          <span>You have a session in progress</span>
                        </div>
                        <button
                          className="text-button"
                          onClick={() =>
                            resume(recent.find((s) => !s.finished).id)
                          }
                        >
                          Resume session
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Layers size={36} />
                    </div>
                    <h2>A space for what you’re learning.</h2>
                    <p>
                      Import a question bank to create your first deck.
                      <br />
                      You can generate the bank with any assistant, then bring
                      it here.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setImportOpen(true)}
                    >
                      <Upload size={17} />
                      Import a question bank
                    </button>
                    <p className="small">
                      JSON, CSV and TSV · No AI account needed
                    </p>
                  </div>
                )}
              </>
            )}
            {section === "library" && (
              <>
                <div className="page-heading compact">
                  <div className="eyebrow">MAKE THE MATERIAL YOURS</div>
                  <h1>
                    Question library<span className="heading-dot">.</span>
                  </h1>
                  <p>
                    Good learning starts with good questions. Keep yours
                    accurate.
                  </p>
                </div>
                <div className="library-toolbar">
                  <label className="search-box">
                    <Search size={18} />
                    <input
                      placeholder="Search questions or concepts"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filter topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  >
                    <option value="">All topics</option>
                    {deck?.stats.topics.map((t) => (
                      <option key={t.topic}>{t.topic}</option>
                    ))}
                  </select>
                  <button
                    className="button secondary"
                    disabled={!deck}
                    onClick={exportDeck}
                  >
                    <Download size={16} />
                    Export
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setImportOpen(true)}
                  >
                    <Plus size={16} />
                    Import
                  </button>
                </div>
                <div className="question-list">
                  {visible.map((i) => (
                    <button
                      className="question-row"
                      key={i.question.id}
                      onClick={() => setEditor(i)}
                    >
                      <span
                        className={`question-state ${i.progress.mastered ? "mastered" : i.progress.attempts ? "learning" : ""}`}
                      >
                        {i.progress.mastered ? <Check size={16} /> : <span />}
                      </span>
                      <div>
                        <span className="row-topic">
                          {i.question.topic} <span>·</span> {i.question.id}
                        </span>
                        <h3>{i.question.question}</h3>
                        <p>{i.question.answer}</p>
                      </div>
                      <Pencil size={16} />
                    </button>
                  ))}
                  {!visible.length && (
                    <div className="empty-state">
                      <h2>No questions here yet.</h2>
                      <p>Try another filter or import a deck.</p>
                    </div>
                  )}
                </div>
              </>
            )}
            {section === "progress" && (
              <>
                <div className="page-heading compact">
                  <div className="eyebrow">KNOW WHERE YOU STAND</div>
                  <h1>
                    Understanding, growing<span className="heading-dot">.</span>
                  </h1>
                  <p>
                    Mastery needs repeated active recall. A lucky guess doesn’t
                    count.
                  </p>
                </div>
                {deck && (
                  <>
                    <div className="progress-summary">
                      <div>
                        <strong>
                          {deck.stats.mastered}
                          <span> / {deck.stats.total}</span>
                        </strong>
                        <p>objectives mastered</p>
                      </div>
                      <div>
                        <strong>{deck.stats.attempts}</strong>
                        <p>answers practised</p>
                      </div>
                      <div>
                        <strong>{deck.stats.due}</strong>
                        <p>reviews ready</p>
                      </div>
                    </div>
                    <div className="section-heading">
                      <h2>Topic by topic</h2>
                      <span>
                        Recognition and self-assessment are recorded separately.
                      </span>
                    </div>
                    <div className="topic-grid">
                      {deck.stats.topics.map((t) => (
                        <article className="topic-card" key={t.topic}>
                          <div>
                            <h3>{t.topic}</h3>
                            <span>
                              {t.mastered}/{t.total}
                            </span>
                          </div>
                          <div className="topic-bar">
                            <span
                              style={{
                                width: `${(t.mastered / t.total) * 100}%`,
                              }}
                            />
                          </div>
                          <p>
                            {t.accuracy === null
                              ? "Ready for your first attempt"
                              : `${t.accuracy}% accuracy · ${t.attempts} attempts`}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => {
                              setTopic(t.topic);
                              setSection("overview");
                            }}
                          >
                            Practise topic
                            <ArrowRight size={15} />
                          </button>
                        </article>
                      ))}
                    </div>
                    <div className="section-heading">
                      <h2>A little more attention</h2>
                      <span>Your most frequently missed questions</span>
                    </div>
                    <div className="question-list">
                      {deck.stats.weak.map((q) => (
                        <div className="weak-row" key={q.id}>
                          <span className="weak-count">{q.wrong}×</span>
                          <div>
                            <small>{q.topic}</small>
                            <p>{q.question}</p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Edit ${q.id}`}
                            onClick={() => edit(q.id)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      ))}
                      {!deck.stats.weak.length && (
                        <p className="quiet empty-line">
                          No missed questions yet. Start a session to discover
                          what needs practice.
                        </p>
                      )}
                    </div>
                    <details className="session-history">
                      <summary>Recent sessions</summary>
                      {recent.map((s) => (
                        <button key={s.id} onClick={() => resume(s.id)}>
                          <span>
                            {fmt(s.mode)} ·{" "}
                            {new Date(s.createdAt).toLocaleDateString()}
                          </span>
                          <span>
                            {s.finished
                              ? "View results"
                              : `${s.cursor}/${s.total} · Resume`}
                            <ArrowRight size={14} />
                          </span>
                        </button>
                      ))}
                    </details>
                  </>
                )}
              </>
            )}
            {section === "settings" && (
              <>
                <div className="page-heading compact">
                  <div className="eyebrow">SIMPLE BY DESIGN</div>
                  <h1>
                    Your workspace<span className="heading-dot">.</span>
                  </h1>
                  <p>
                    A local learning tool. Your question banks and progress live
                    in PostgreSQL.
                  </p>
                </div>
                <div className="settings-card">
                  <h2>Keep quizzes on this device</h2>
                  <p>
                    Download the full quiz and study without contacting the
                    server for each answer. Progress saves here immediately,
                    then syncs when you finish, leave, or refresh. New questions
                    arrive only when you refresh.
                  </p>
                  <label className="storage-choice">
                    <input
                      type="checkbox"
                      checked={cache.enabled}
                      onChange={(e) =>
                        void run(async () => {
                          const enabled = e.target.checked;
                          if (!enabled) await syncDownloads();
                          else await refreshDownloads();
                          setDownloadedMode(enabled);
                          await refresh();
                          setNotice(
                            enabled
                              ? "Downloaded study mode enabled."
                              : "Live-server mode enabled.",
                          );
                        })
                      }
                    />
                    Use downloaded study mode
                  </label>
                  <p className="small">
                    {cache.downloadedAt
                      ? `Last downloaded: ${new Date(cache.downloadedAt).toLocaleString()}`
                      : "No quiz download yet."}{" "}
                    {cache.pending
                      ? `${cache.pending} session(s) waiting to sync.`
                      : "Progress is synced."}
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await refreshDownloads();
                        await refresh();
                        setNotice("Downloaded quizzes are up to date.");
                      })
                    }
                  >
                    <RotateCcw size={16} />
                    Sync progress & refresh quizzes
                  </button>
                  <p className="small">
                    Phone and computer keep their own downloads. Refresh either
                    device to pick up progress from the other. Clearing browser
                    storage removes unsynced local attempts.
                  </p>
                </div>
                <div className="settings-card">
                  <h2>Bring your own questions</h2>
                  <p>
                    Use any assistant to prepare a structured bank, then import
                    it here or through the CLI. Recall has no AI integration or
                    subscription.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload size={16} />
                    Import a bank
                  </button>
                </div>
                <div className="settings-card">
                  <h2>How mastery works</h2>
                  <p>
                    Three consecutive successes, including at least two written
                    or self-rated recalls, establish initial mastery. Questions
                    return for later review. Mistakes reset the streak; editing
                    the material resets the affected objective.
                  </p>
                  <p>
                    Free-form answers use a model answer and your honest
                    self-assessment. Structured answers use explicit accepted
                    answers, never a fuzzy guess.
                  </p>
                </div>
              </>
            )}
            <footer>
              <span className="footer-brand">recall.</span>
              <span>Learn it for real.</span>
              <span>Small steps. Stronger recall.</span>
            </footer>
          </div>
        )}
        {inStudy && (
          <div className="study-page">
            <div className="study-top">
              <button className="text-button" onClick={leave}>
                <ArrowLeft size={16} />
                Save & leave
              </button>
              <span>{deck?.name}</span>
              <span className="study-mode">{fmt(session.mode)}</span>
            </div>
            {(!session.finished || feedback) && (
              <>
                <div className="study-progress-label">
                  <span>
                    {feedback
                      ? "A little stronger already"
                      : session.mode === "test"
                        ? "Take your time. Trust what you know."
                        : "One question. A little deeper."}
                  </span>
                  <span>
                    {Math.min(
                      session.cursor + (feedback ? 0 : 1),
                      session.total,
                    )}{" "}
                    / {session.total}
                    {session.deadline && (
                      <>
                        {" "}
                        · <Clock size={13} />
                        {Math.max(
                          0,
                          Math.floor(
                            (Date.parse(session.deadline) - now) / 60000,
                          ),
                        )}
                        :
                        {String(
                          Math.max(
                            0,
                            Math.floor(
                              (Date.parse(session.deadline) - now) / 1000,
                            ) % 60,
                          ),
                        ).padStart(2, "0")}
                      </>
                    )}
                  </span>
                </div>
                <div className="study-progress">
                  <span
                    style={{
                      width: `${(session.cursor / session.total) * 100}%`,
                    }}
                  />
                </div>
              </>
            )}
            {feedback ? (
              <div className="study-card feedback-card">
                <div
                  className={`feedback-status ${feedback.correct ? "correct" : "incorrect"}`}
                >
                  {feedback.correct ? (
                    <CheckCheck size={22} />
                  ) : (
                    <RotateCcw size={22} />
                  )}
                  <span>
                    {feedback.correct
                      ? "That’s it."
                      : "Let’s make this one stick."}
                  </span>
                  {feedback.selfAssessed && <small>SELF-ASSESSED</small>}
                </div>
                <div className="eyebrow">{feedback.topic}</div>
                <h2>{feedback.question}</h2>
                <div className="model-answer">
                  <span>MODEL ANSWER</span>
                  <p>{feedback.answer}</p>
                </div>
                {feedback.explanation && (
                  <p className="explanation">{feedback.explanation}</p>
                )}
                <div className="feedback-bottom">
                  <button
                    className="text-button quiet"
                    onClick={() => edit(feedback.questionId)}
                  >
                    <Pencil size={14} />
                    Something off? Edit question
                  </button>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={next}
                  >
                    {session.finished ? "See session results" : "Continue"}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            ) : session.finished ? (
              <Results
                session={session}
                busy={busy}
                onRate={(index, rating) =>
                  void run(async () => {
                    setSession(
                      await api<SessionView>(`/sessions/${session.id}/rate`, {
                        index,
                        rating,
                      }),
                    );
                    void refresh();
                  })
                }
                onEdit={edit}
                onBack={leave}
                onAgain={() => start(session.mode)}
              />
            ) : (
              card && (
                <>
                  <section className="study-card">
                    <div className="card-topline">
                      <span className="topic-tag">{card.topic}</span>
                      <span className="format-label">
                        {card.format === "written"
                          ? "ACTIVE RECALL"
                          : card.format === "flashcard"
                            ? "RECALL & REFLECT"
                            : card.format === "matching"
                              ? "MAKE THE CONNECTION"
                              : "RECOGNITION"}
                      </span>
                    </div>
                    <h2>{card.question}</h2>
                    {!reveal && (
                      <>
                        {card.options ? (
                          <>
                            <p className="answer-hint">
                              {card.format === "multiple_select"
                                ? "Select all correct answers."
                                : "Choose one answer."}
                            </p>
                            <div className="options">
                              {card.options.map((option, i) => (
                                <button
                                  key={option}
                                  className={`option ${selected.includes(option) ? "selected" : ""}`}
                                  aria-pressed={selected.includes(option)}
                                  onClick={() =>
                                    setSelected((s) =>
                                      card.format === "multiple_select"
                                        ? s.includes(option)
                                          ? s.filter((x) => x !== option)
                                          : [...s, option]
                                        : [option],
                                    )
                                  }
                                >
                                  <span className="option-number">{i + 1}</span>
                                  <span>{option}</span>
                                  <span
                                    className={`option-check ${card.format === "multiple_select" ? "square" : ""}`}
                                  >
                                    {selected.includes(option) && (
                                      <Check size={14} />
                                    )}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        ) : card.format === "matching" ? (
                          <div className="matching-fields">
                            <p className="answer-hint">
                              Choose the matching answer for each item.
                            </p>
                            {card.left?.map((left) => (
                              <label key={left}>
                                <span>{left}</span>
                                <select
                                  aria-label={`Match ${left}`}
                                  value={pairs[left] ?? ""}
                                  onChange={(e) =>
                                    setPairs({
                                      ...pairs,
                                      [left]: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">Choose a match</option>
                                  {card.right?.map((right) => (
                                    <option key={right}>{right}</option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </div>
                        ) : card.format === "flashcard" ? (
                          <div className="flashcard-front">
                            <Layers size={32} />
                            <p>
                              Bring the answer to mind.
                              <br />
                              Then turn the card.
                            </p>
                          </div>
                        ) : (
                          <div className="written-answer">
                            <label htmlFor="written-response">
                              Your answer
                            </label>
                            <textarea
                              id="written-response"
                              ref={inputRef}
                              rows={4}
                              value={response}
                              onChange={(e) => setResponse(e.target.value)}
                              placeholder="Recall it in your own words…"
                            />
                            <p>
                              {card.selfGrade
                                ? "You’ll compare with a model answer and assess your recall."
                                : "For multi-part rules, separate each part with a semicolon. Accepted wording is checked explicitly."}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {reveal && (
                      <div className="reveal-answer">
                        <span className="eyebrow">MODEL ANSWER</span>
                        <p className="reveal-model">{reveal.answer}</p>
                        <p className="explanation">{reveal.explanation}</p>
                        {reveal.rubric.length > 0 && (
                          <ul>
                            {reveal.rubric.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        )}
                        <span className="eyebrow">HOW DID YOU DO?</span>
                        <div className="rating-buttons">
                          {[
                            {
                              id: "again",
                              name: "Again",
                              copy: "Couldn’t recall it",
                            },
                            {
                              id: "hard",
                              name: "Hard",
                              copy: "Got it, with effort",
                            },
                            {
                              id: "good",
                              name: "Good",
                              copy: "Recalled it clearly",
                            },
                            {
                              id: "easy",
                              name: "Easy",
                              copy: "Knew it instantly",
                            },
                          ].map((r, i) => (
                            <button
                              className={`rating ${r.id}`}
                              key={r.id}
                              disabled={busy}
                              onClick={() => submit(r.id)}
                            >
                              <span>
                                <kbd>{i + 1}</kbd>
                                {r.name}
                              </span>
                              <small>{r.copy}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!reveal && (
                      <div className="card-bottom">
                        <span>
                          <Keyboard size={15} />
                          {card.options
                            ? "1–9 to select · Enter to check"
                            : "Ctrl / ⌘ + Enter to continue"}
                        </span>
                        <button
                          className="button primary"
                          disabled={busy || !canAnswer}
                          onClick={() => submit()}
                        >
                          {busy
                            ? "Saving…"
                            : card.format === "flashcard"
                              ? "Reveal answer"
                              : card.selfGrade && session.mode !== "test"
                                ? "Compare answer"
                                : session.mode === "test"
                                  ? "Save answer"
                                  : "Check answer"}
                          <ArrowRight size={17} />
                        </button>
                      </div>
                    )}
                  </section>
                  <div className="study-under">
                    <p>
                      <span className="status-dot" />
                      {cache.enabled
                        ? "Saved on this device. Syncs when you finish or leave."
                        : "Your progress saves after every answer."}
                    </p>
                    {session.mode === "test" && (
                      <button
                        className="text-button quiet"
                        onClick={() =>
                          void run(async () => {
                            setSession(
                              await api<SessionView>(
                                `/sessions/${session.id}/finish`,
                                { version: session.version },
                              ),
                            );
                          })
                        }
                      >
                        Finish test early
                      </button>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        )}
      </main>
      {editor && (
        <Editor
          item={editor}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={saveEdit}
        />
      )}
      {importOpen && (
        <ImportDialog
          busy={busy}
          onClose={() => setImportOpen(false)}
          onImport={(bank, replace) =>
            void run(async () => {
              const r = await api<{
                deckId: string;
                created: number;
                updated: number;
                unchanged: number;
                archived: number;
              }>(`/import${replace ? "?replace=1" : ""}`, bank);
              setImportOpen(false);
              await refresh();
              setDeckId(r.deckId);
              setNotice(
                `${r.created} added · ${r.updated} updated · ${r.unchanged} unchanged · ${r.archived} archived`,
              );
            })
          }
        />
      )}
    </div>
  );
}

function Results({
  session,
  busy,
  onRate,
  onEdit,
  onBack,
  onAgain,
}: {
  session: SessionView;
  busy: boolean;
  onRate: (i: number, r: string) => void;
  onEdit: (id: string) => void;
  onBack: () => void;
  onAgain: () => void;
}) {
  const r = session.result!;
  const percent = r.graded ? Math.round((r.correct / r.graded) * 100) : 0;
  return (
    <div className="results">
      <div className="result-hero">
        <div className="result-mark">
          <CheckCheck size={30} />
        </div>
        <div className="eyebrow">A SESSION WELL SPENT</div>
        <h1>
          It’s starting to stick<span className="heading-dot">.</span>
        </h1>
        <p>Every attempt makes the next recall a little easier.</p>
        <div className="result-stats">
          <div>
            <strong>
              {r.correct}
              <em>/{r.graded}</em>
            </strong>
            <span>correct graded answers</span>
          </div>
          <div>
            <strong>
              {percent}
              <em>%</em>
            </strong>
            <span>session accuracy</span>
          </div>
          <div>
            <strong>{r.pending}</strong>
            <span>to self-assess</span>
          </div>
        </div>
        {r.unanswered > 0 && (
          <p>
            {r.unanswered} unanswered questions · Unanswered items are excluded
            from accuracy.
          </p>
        )}
        <div className="result-actions">
          <button className="button secondary" onClick={onBack}>
            Back to your deck
          </button>
          <button className="button primary" disabled={busy} onClick={onAgain}>
            Practise again
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
      <div className="result-topics">
        {r.topics.map((t) => (
          <span key={t.topic}>
            {t.topic}
            <strong>
              {t.correct}/{t.total}
            </strong>
          </span>
        ))}
      </div>
      <div className="section-heading">
        <h2>Reflect & remember</h2>
        <span>Includes repeated attempts during Learn and Cram.</span>
      </div>
      {r.answers.map((a, i) => (
        <details
          className={`result-answer ${a.outdated ? "outdated" : a.correct === true ? "correct" : a.correct === false ? "incorrect" : ""}`}
          key={i}
          open={a.correct === null && !a.outdated}
        >
          <summary>
            <span className="answer-status">
              {a.outdated
                ? "—"
                : a.correct === null
                  ? "?"
                  : a.correct
                    ? "✓"
                    : "↻"}
            </span>
            <span>
              {a.question}
              <small>
                {a.topic}
                {a.selfAssessed ? " · Self-assessed" : ""}
                {a.outdated ? " · Changed question, excluded from score" : ""}
              </small>
            </span>
            <ChevronDown size={16} />
          </summary>
          <div className="result-answer-body">
            <span className="eyebrow">YOUR ANSWER</span>
            <p>
              {typeof a.response === "string"
                ? a.response
                : JSON.stringify(a.response)}
            </p>
            <span className="eyebrow">MODEL ANSWER</span>
            <p>{a.answer}</p>
            <p className="explanation">{a.explanation}</p>
            {a.rubric && (
              <ul className="result-rubric">
                {a.rubric.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
            {a.correct === null && !a.outdated && (
              <div className="rating-buttons">
                {["again", "hard", "good", "easy"].map((r) => (
                  <button
                    className={`rating ${r}`}
                    disabled={busy}
                    key={r}
                    onClick={() => onRate(a.index, r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            <button
              className="text-button quiet"
              onClick={() => onEdit(a.questionId)}
            >
              <Pencil size={14} />
              Correct this question
            </button>
          </div>
        </details>
      ))}
    </div>
  );
}

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,input,textarea,select,[tabindex="0"]',
        ) ?? [],
      ).filter((e) => !(e as HTMLButtonElement).disabled);
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = focusable();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, []);
  return ref;
}
function Editor({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: Item;
  busy: boolean;
  onClose: () => void;
  onSave: (q: Question) => void;
}) {
  const [q, setQ] = useState(item.question),
    [advanced, setAdvanced] = useState(false),
    [raw, setRaw] = useState(JSON.stringify(item.question, null, 2)),
    [error, setError] = useState("");
  const ref = useDialog(onClose);
  const field = (key: keyof Question, value: any) =>
    setQ({ ...q, [key]: value });
  const save = () => {
    try {
      const value = advanced ? JSON.parse(raw) : q;
      setError("");
      onSave(value);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal editor"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">KEEP YOUR MATERIAL ACCURATE</div>
            <h2 id="editor-title">Edit question</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close editor"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="editor-note">
          Changing the question or answer resets this objective’s progress and
          excludes old attempts from scores.
        </p>
        <div className="editor-tabs">
          <button
            className={!advanced ? "active" : ""}
            onClick={() => {
              if (advanced) {
                try {
                  setQ(JSON.parse(raw));
                  setAdvanced(false);
                  setError("");
                } catch {
                  setError("Fix the JSON before switching to the form.");
                }
              }
            }}
          >
            Simple editor
          </button>
          <button
            className={advanced ? "active" : ""}
            onClick={() => {
              setRaw(JSON.stringify(q, null, 2));
              setAdvanced(true);
            }}
          >
            All formats · JSON
          </button>
        </div>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {advanced ? (
          <label className="field">
            Complete question definition
            <textarea
              className="code-input"
              rows={20}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </label>
        ) : (
          <div className="editor-fields">
            <div className="field-row">
              <label className="field">
                Topic
                <input
                  value={q.topic}
                  onChange={(e) => field("topic", e.target.value)}
                />
              </label>
              <label className="field">
                Concept
                <input
                  value={q.concept}
                  onChange={(e) => field("concept", e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              Question
              <textarea
                rows={3}
                value={q.question}
                onChange={(e) => field("question", e.target.value)}
              />
            </label>
            <label className="field">
              Model answer
              <textarea
                rows={3}
                value={q.answer}
                onChange={(e) => field("answer", e.target.value)}
              />
            </label>
            <label className="field">
              Explanation
              <textarea
                rows={3}
                value={q.explanation}
                onChange={(e) => field("explanation", e.target.value)}
              />
            </label>
            {q.options && (
              <>
                <label className="field">
                  Choices · one per line
                  <textarea
                    rows={4}
                    value={q.options.join("\n")}
                    onChange={(e) =>
                      field("options", e.target.value.split("\n"))
                    }
                  />
                </label>
                <label className="field">
                  Correct choices · one per line
                  <textarea
                    rows={2}
                    value={(q.correct ?? [q.answer]).join("\n")}
                    onChange={(e) =>
                      field("correct", e.target.value.split("\n"))
                    }
                  />
                </label>
              </>
            )}
            {q.acceptedAnswers && (
              <label className="field">
                Accepted written answers · one per line
                <textarea
                  rows={3}
                  value={q.acceptedAnswers.join("\n")}
                  onChange={(e) =>
                    field("acceptedAnswers", e.target.value.split("\n"))
                  }
                />
              </label>
            )}
            {q.requiredParts && (
              <label className="field">
                Required parts · one per line, aliases separated by |
                <textarea
                  rows={3}
                  value={q.requiredParts.map((p) => p.join(" | ")).join("\n")}
                  onChange={(e) =>
                    field(
                      "requiredParts",
                      e.target.value
                        .split("\n")
                        .map((p) => p.split("|").map((a) => a.trim())),
                    )
                  }
                />
              </label>
            )}
            <p className="small quiet">
              Edit scenario variants, matching pairs and rubrics in “All
              formats”.
            </p>
          </div>
        )}
        <div className="modal-foot">
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save correction"}
            <Check size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
function ImportDialog({
  busy,
  onClose,
  onImport,
}: {
  busy: boolean;
  onClose: () => void;
  onImport: (bank: unknown, replace: boolean) => void;
}) {
  const [replace, setReplace] = useState(false);
  const [raw, setRaw] = useState(""),
    [error, setError] = useState("");
  const ref = useDialog(onClose);
  const load = async (file?: File) => {
    if (!file) return;
    setError("");
    if (!file.name.endsWith(".json")) {
      setError("Use the CLI for CSV or TSV imports. This dialog accepts JSON.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a file smaller than 5 MB.");
      return;
    }
    setRaw(await file.text());
  };
  const submit = () => {
    try {
      setError("");
      onImport(JSON.parse(raw), replace);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">BRING SOMETHING TO LEARN</div>
            <h2 id="import-title">Add a question bank</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close import"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="quiet">
          Drop in a bank prepared by you or your assistant. Matching IDs update
          existing questions.
        </p>
        <label className="file-drop">
          <Upload size={25} />
          <strong>Choose a JSON file</strong>
          <span>or paste your bank below</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => void load(e.target.files?.[0])}
          />
        </label>
        <label className="field">
          Question bank JSON
          <textarea
            rows={8}
            className="code-input"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={
              '{ "schemaVersion": 1, "deck": "My subject", "questions": [...] }'
            }
          />
        </label>
        <label className="storage-choice">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
          />
          Replace this deck: archive questions absent from the file
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-foot">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !raw.trim()}
            onClick={submit}
          >
            {busy ? "Importing…" : "Import questions"}
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  void navigator.serviceWorker.register("/sw.js").catch(() => {});
