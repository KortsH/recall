export type ThemePreference = "system" | "light" | "dark";
export const resolveTheme = (
  preference: ThemePreference,
  systemDark: boolean,
) => (preference === "system" ? (systemDark ? "dark" : "light") : preference);
export function loadTheme(): ThemePreference {
  try {
    const value = localStorage.getItem("recall-theme");
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
export function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(
    preference,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#18171f" : "#f8f7f4");
  return resolved;
}
export function saveTheme(preference: ThemePreference) {
  try {
    localStorage.setItem("recall-theme", preference);
  } catch {}
  return applyTheme(preference);
}
