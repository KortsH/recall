import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { parseBank } from "../core/bank.ts";
import { Store, AppError } from "./store.ts";

async function body(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw new AppError("Request exceeds 5 MB", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("Invalid JSON");
  }
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
export function createApp(store: Store, staticDir = resolve("dist")) {
  return createServer(async (req, res) => {
    try {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      const method = req.method ?? "GET";
      // Local app: reject cross-origin writes rather than exposing an unauthenticated mutation API.
      if (!["GET", "HEAD"].includes(method)) {
        const origin = req.headers.origin;
        if (
          origin &&
          new URL(origin).host !== req.headers.host &&
          !(
            new URL(origin).hostname === "127.0.0.1" &&
            new URL(origin).port === "5173"
          )
        )
          throw new AppError("Cross-origin request rejected", 403);
        if (!req.headers["content-type"]?.startsWith("application/json"))
          throw new AppError("Use application/json", 415);
      }
      if (path === "/api/health") {
        await store.pool.query("SELECT 1");
        return json(res, 200, { ok: true });
      }
      if (path === "/api/decks" && method === "GET")
        return json(res, 200, await store.decks());
      if (path === "/api/import" && method === "POST")
        return json(
          res,
          200,
          await store.importBank(parseBank(await body(req))),
        );
      let match = path.match(/^\/api\/decks\/([^/]+)(?:\/(.*))?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const rest = match[2] ?? "";
        if (!rest && method === "GET")
          return json(res, 200, await store.deck(id));
        if (rest === "questions" && method === "GET")
          return json(res, 200, await store.items(id));
        if (rest === "export" && method === "GET")
          return json(res, 200, await store.exportBank(id));
        if (rest === "sessions" && method === "GET")
          return json(res, 200, await store.recentSessions(id));
        if (rest === "sessions" && method === "POST")
          return json(res, 201, await store.createSession(id, await body(req)));
        const q = rest.match(/^questions\/([^/]+)$/);
        if (q) {
          const qid = decodeURIComponent(q[1]);
          if (method === "GET")
            return json(res, 200, await store.question(id, qid));
          if (method === "PUT") {
            const b = await body(req);
            return json(
              res,
              200,
              await store.editQuestion(id, qid, b.question, b.revision),
            );
          }
        }
      }
      match = path.match(/^\/api\/sessions\/([^/]+)(?:\/(.*))?$/);
      if (match) {
        const id = match[1];
        const rest = match[2] ?? "";
        if (!rest && method === "GET")
          return json(res, 200, await store.getSession(id));
        if (method === "POST") {
          const b = await body(req);
          if (rest === "answer")
            return json(res, 200, await store.answer(id, b));
          if (rest === "reveal")
            return json(res, 200, await store.reveal(id, b));
          if (rest === "finish")
            return json(res, 200, await store.finish(id, b.version));
          if (rest === "rate")
            return json(res, 200, await store.rateTest(id, b.index, b.rating));
        }
      }
      if (path.startsWith("/api/"))
        throw new AppError("Endpoint not found", 404);
      if (method !== "GET" && method !== "HEAD")
        throw new AppError("Method not allowed", 405);
      const target = resolve(staticDir, "." + decodeURIComponent(path));
      if (target !== staticDir && !target.startsWith(staticDir + sep))
        throw new AppError("Invalid path", 400);
      let data: Buffer;
      let file = target;
      try {
        data = await readFile(target);
      } catch {
        if (extname(path)) throw new AppError("File not found", 404);
        file = resolve(staticDir, "index.html");
        try {
          data = await readFile(file);
        } catch {
          throw new AppError(
            "Frontend is not built. Run npm run dev or npm run build.",
            503,
          );
        }
      }
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "Cache-Control":
          extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
      });
      res.end(method === "HEAD" ? undefined : data);
    } catch (e) {
      const error = e as Error;
      const status = e instanceof AppError ? e.status : 400;
      json(res, status, {
        error: status >= 500 ? "Server error" : error.message,
      });
    }
  });
}
