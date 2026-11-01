/** Explicit hosts prevent DNS rebinding against the local, single-user API. */
export function allowedHost(
  host: string | undefined,
  origins = process.env.RECALL_ALLOWED_ORIGINS ?? "",
) {
  if (!host || /[\s/@\\]/.test(host)) return false;
  try {
    const parsed = new URL(`http://${host}`);
    if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
      return true;
    return origins.split(",").some((origin) => {
      try {
        return new URL(origin.trim()).host === host;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
