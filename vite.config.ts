import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage } from "node:http";
import * as gameRoute from "./api/game";
import * as matchRoute from "./api/deezer/match";
import * as trackRoute from "./api/deezer/track";

type Handler = (req: Request) => Promise<Response>;
type Route = Partial<Record<"GET" | "POST", Handler>>;

// Same handlers Vercel runs from /api, mounted on the dev server so
// `npm run dev` works without the Vercel CLI.
const routes: Record<string, Route> = {
  "/api/game": gameRoute,
  "/api/deezer/match": matchRoute,
  "/api/deezer/track": trackRoute,
};

function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const route = routes[url.pathname];
        if (!route) return next();

        const handler = route[req.method as "GET" | "POST"];
        if (!handler) {
          res.statusCode = 405;
          return res.end();
        }
        try {
          const body = req.method === "POST" ? await readBody(req) : undefined;
          const response = await handler(
            new Request(url, { method: req.method, headers: req.headers as HeadersInit, body }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default defineConfig({
  plugins: [react(), devApi()],
  // Spotify rejects "localhost" redirect URIs, so serve on the loopback IP.
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
