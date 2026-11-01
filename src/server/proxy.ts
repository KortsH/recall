import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import "dotenv/config";
import { allowedHost } from "./access.ts";
const origin = new URL(process.env.RECALL_SERVER_URL!);
if (!["http:", "https:"].includes(origin.protocol))
  throw new Error("RECALL_SERVER_URL must be HTTP(S)");
const app = createServer((req, res) => {
  if (!allowedHost(req.headers.host, "")) {
    res.writeHead(403);
    res.end("Host not allowed");
    return;
  }
  const target = new URL(req.url ?? "/", origin);
  if (target.origin !== origin.origin) {
    res.writeHead(400);
    res.end("Invalid request target");
    return;
  }
  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = request(
    target,
    { method: req.method, headers: { ...req.headers, host: target.host } },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent)
      res.writeHead(503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
    res.end(
      JSON.stringify({
        error:
          "Home server unavailable. Downloaded quizzes and unsynced progress remain on this device.",
      }),
    );
  });
  req.pipe(upstream);
});
app.listen(
  Number(process.env.PORT ?? 4310),
  process.env.HOST ?? "127.0.0.1",
  () =>
    console.log(
      `Recall at http://127.0.0.1:${process.env.PORT ?? 4310} → ${origin.origin}`,
    ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => app.close(() => process.exit(0)));
