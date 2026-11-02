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
      error:
        "Could not check for an app update. Your current app and learning data are kept.",
    });
  } finally {
    emit({ checking: false });
  }
}
