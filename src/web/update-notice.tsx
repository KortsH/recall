import React from "react";
import { Bell } from "lucide-react";
import { tr, useLanguage } from "./i18n.ts";
import type { UpdateState } from "./updates.ts";

export function UpdateNotice({
  state,
  deferred,
  busy,
  onLater,
  onShow,
  onReload,
  onDownload,
}: {
  state: UpdateState;
  deferred: boolean;
  busy: boolean;
  onLater: () => void;
  onShow: () => void;
  onReload: () => void;
  onDownload: () => boolean;
}) {
  useLanguage();
  if (!state.available && !state.release) return null;
  if (deferred)
    return (
      <div className="app-update-banner compact" role="status">
        <Bell size={14} />
        <strong>{tr("updates.available")}</strong>
        <button className="text-button" onClick={onShow}>
          {tr("updates.show")}
        </button>
      </div>
    );
  return (
    <div className="app-update-banner" role="status">
      <Bell size={19} aria-hidden="true" />
      <div>
        <strong>
          {state.available
            ? tr("app.an_app_update_is_ready")
            : tr("updates.release", { version: state.release!.version })}
        </strong>
        <span>
          {state.available
            ? tr("app.your_current_question_and_pending_progress_stay_saved_on")
            : tr("updates.install")}
        </span>
        {state.available && state.release && (
          <span>
            {tr("updates.release", { version: state.release.version })}
          </span>
        )}
      </div>
      <button className="button secondary" disabled={busy} onClick={onLater}>
        {tr("common.later")}
      </button>
      {state.available && (
        <button className="button primary" disabled={busy} onClick={onReload}>
          {tr("app.save_reload")}
        </button>
      )}
      {state.release && (
        <a
          className="button secondary"
          href={state.release.url}
          target={state.release.platform === "android" ? undefined : "_blank"}
          rel="noreferrer"
          onClick={(event) => {
            if (busy || !onDownload()) event.preventDefault();
          }}
        >
          {tr("updates.download")}
        </a>
      )}
    </div>
  );
}
