import i18next from "i18next";
import { useSyncExternalStore } from "react";
import en from "./locales/en.json";
import et from "./locales/et.json";

type PluralBase<K> =
  K extends `${infer Base}_${"one" | "other" | "zero" | "two" | "few" | "many"}`
    ? Base
    : never;
export type MessageKey = keyof typeof en | PluralBase<keyof typeof en>;
type Catalog = Record<string, string>;
const discovered = import.meta.env?.MODE
  ? import.meta.glob<Catalog>("./locales/*.json", {
      eager: true,
      import: "default",
    })
  : { "./locales/en.json": en, "./locales/et.json": et };
export const catalogs: Record<string, Catalog> = Object.fromEntries(
  Object.entries(discovered).map(([path, data]) => [
    path
      .split("/")
      .at(-1)!
      .replace(/\.json$/, ""),
    data,
  ]),
);
export const availableLanguages = Object.entries(catalogs).map(
  ([code, catalog]) => ({ code, name: catalog["meta.name"] ?? code }),
);
export function supportedLanguage(value: string): string | undefined {
  const exact = availableLanguages.find(
    (l) => l.code.toLowerCase() === value.toLowerCase(),
  );
  return (
    exact?.code ??
    availableLanguages.find((l) => l.code === value.toLowerCase().split("-")[0])
      ?.code
  );
}
export function initialLanguage(
  storage?: Pick<Storage, "getItem">,
  languages?: readonly string[],
) {
  try {
    const saved = supportedLanguage(
      (storage ?? globalThis.localStorage)?.getItem("recall-language") ?? "",
    );
    if (saved) return saved;
  } catch {}
  for (const candidate of languages ??
    (typeof navigator !== "undefined" ? navigator.languages : [])) {
    const supported = supportedLanguage(candidate);
    if (supported) return supported;
  }
  return "en";
}
export const i18n = i18next.createInstance();
void i18n.init({
  lng: initialLanguage(),
  fallbackLng: "en",
  supportedLngs: Object.keys(catalogs),
  resources: Object.fromEntries(
    Object.entries(catalogs).map(([code, translation]) => [
      code,
      { translation },
    ]),
  ),
  keySeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false, skipOnVariables: true },
});
export const getLanguage = () => i18n.resolvedLanguage ?? i18n.language ?? "en";
export function tr(
  key: MessageKey,
  values: Record<string, unknown> = {},
): string {
  return i18n.t(key, { ...values, returnObjects: false });
}
export async function setLanguage(code: string) {
  if (!Object.hasOwn(catalogs, code)) throw new Error(tr("error.unexpected"));
  await i18n.changeLanguage(code);
  try {
    localStorage.setItem("recall-language", code);
  } catch {}
  updateDocumentLanguage();
}
function subscribe(listener: () => void) {
  i18n.on("languageChanged", listener);
  return () => {
    i18n.off("languageChanged", listener);
  };
}
export const useLanguage = () =>
  useSyncExternalStore(subscribe, getLanguage, () => "en");
export function updateDocumentLanguage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = getLanguage();
  document.documentElement.dir = i18n.dir();
  document.title = tr("meta.pageTitle");
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", tr("meta.description"));
}
i18n.on("languageChanged", updateDocumentLanguage);
updateDocumentLanguage();

const exactMessages = new Map<string, MessageKey>(
  Object.values(catalogs).flatMap((catalog) =>
    Object.entries(catalog)
      .filter(([, v]) => !v.includes("{{"))
      .map(([key, value]) => [value, key as MessageKey] as const),
  ),
);
/** Adapter for older server/validator messages. Question and answer content never passes here. */
export function translateMessage(message: string): string {
  const key = exactMessages.get(message);
  return key ? tr(key) : message;
}
export const knownMessage = (message: string) => exactMessages.has(message);
