import { tr } from "./i18n.ts";
/** The native helper can only open a save-file picker; it exposes no filesystem reads. */
declare global {
  interface Window {
    RecallFiles?: { postMessage: (value: string) => void };
  }
}
export function saveJson(name: string, value: unknown) {
  const content = JSON.stringify(value, null, 2) + "\n";
  if (new TextEncoder().encode(content).length > 5 * 1024 * 1024)
    throw new Error(tr("files.export_exceeds_the_5_mb_portable_file_limit"));
  if (window.RecallFiles) {
    window.RecallFiles.postMessage(
      JSON.stringify({ action: "save", name, content }),
    );
    return;
  }
  if (location.hostname === "appassets.androidplatform.net")
    throw new Error(
      tr("files.update_android_system_webview_to_enable_saving_quiz_files"),
    );
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
