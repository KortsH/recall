import { tr } from "./i18n.ts";
export type UpdateState = {
  available: boolean;
  supported: boolean;
  checking: boolean;
  error: string;
};
let state: UpdateState = {
  available: false,
  supported: false,
  checking: false,
  error: "",
};
let registration: ServiceWorkerRegistration | undefined;
const listeners = new Set<(state: UpdateState) => void>();
const emit = (next: Partial<UpdateState>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
};
export function subscribeUpdates(listener: (state: UpdateState) => void) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}
/** A new controller is ready, but no tab reloads until its user explicitly chooses. */
export async function startAppUpdates(
  container: ServiceWorkerContainer,
  url: string,
) {
  let controlled = !!container.controller;
  const changed = () => {
    if (controlled) emit({ available: true });
    controlled = true;
  };
  container.addEventListener("controllerchange", changed);
  try {
    registration = await container.register(url, { updateViaCache: "none" });
    emit({ supported: true });
  } catch {
    container.removeEventListener("controllerchange", changed);
  }
}
export async function checkAppUpdates() {
  if (!registration) return;
  emit({ checking: true, error: "" });
  try {
    await registration.update();
  } catch {
    emit({
      error: tr("updates.could_not_check_for_an_app_update_your_current"),
    });
  } finally {
    emit({ checking: false });
  }
}
