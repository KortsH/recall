/** The native helper can only open a save-file picker; it exposes no filesystem reads. */
declare global {
  interface Window {
    RecallFiles?: { postMessage: (value: string) => void };
  }
}
export function saveJson(name: string, value: unknown) {
  const content = JSON.stringify(value, null, 2) + "\n";
  if (new TextEncoder().encode(content).length > 5 * 1024 * 1024)
    throw new Error("Export exceeds the 5 MB portable-file limit");
  if (window.RecallFiles) {
    window.RecallFiles.postMessage(
      JSON.stringify({ action: "save", name, content }),
    );
    return;
  }
  if (location.hostname === "appassets.androidplatform.net")
    throw new Error(
      "Update Android System WebView to enable saving quiz files, then reopen Recall.",
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
