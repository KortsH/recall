import React, { useState } from "react";
import { knownMessage, tr, translateMessage, useLanguage } from "./i18n.ts";

/** Server/JSON validator diagnostics stay available without becoming untranslated primary UI. */
export function ErrorMessage({ message }: { message: string }) {
  useLanguage();
  const [expanded, setExpanded] = useState(false);
  if (knownMessage(message)) return <>{translateMessage(message)}</>;
  return (
    <span className="translated-error">
      {tr("error.unexpected")}{" "}
      <button
        type="button"
        className="text-button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {tr("error.details")}
      </button>
      {expanded && (
        <code
          style={{
            display: "block",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {message}
        </code>
      )}
    </span>
  );
}
