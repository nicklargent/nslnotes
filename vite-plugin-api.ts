/**
 * Vite plugin that provides file system API endpoints for web mode.
 * Mirrors the Tauri backend commands so the app can run in a browser.
 */
import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { type IncomingMessage, type ServerResponse } from "node:http";

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function getQueryParam(url: string, param: string): string | null {
  const u = new URL(url, "http://localhost");
  return u.searchParams.get(param);
}

function sendJson(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 500) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

export default function apiPlugin(): Plugin {
  return {
    name: "nslnotes-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) {
          return next();
        }

        void handleApi(req, res, url);
      });
    },
  };
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
) {
  try {
    const pathname = new URL(url, "http://localhost").pathname;

    // GET/PUT/DELETE /api/files
    if (pathname === "/api/files") {
      if (req.method === "GET") {
        const filePath = getQueryParam(url, "path");
        if (!filePath) return sendError(res, "Missing path param", 400);
        if (!fs.existsSync(filePath))
          return sendError(res, "File not found", 404);
        const content = fs.readFileSync(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end(content);
      }

      if (req.method === "PUT") {
        const body = JSON.parse(await parseBody(req)) as {
          path: string;
          content: string;
        };
        const dir = path.dirname(body.path);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(body.path, body.content, "utf-8");
        return sendJson(res, { ok: true });
      }

      if (req.method === "DELETE") {
        const filePath = getQueryParam(url, "path");
        if (!filePath) return sendError(res, "Missing path param", 400);
        if (!fs.existsSync(filePath))
          return sendError(res, "File not found", 404);
        fs.unlinkSync(filePath);
        return sendJson(res, { ok: true });
      }
    }

    // DELETE /api/files/rmdir — recursively delete a directory
    if (pathname === "/api/files/rmdir" && req.method === "DELETE") {
      const dirPath = getQueryParam(url, "path");
      if (!dirPath) return sendError(res, "Missing path param", 400);
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
      return sendJson(res, { ok: true });
    }

    // GET /api/files/exists
    if (pathname === "/api/files/exists" && req.method === "GET") {
      const filePath = getQueryParam(url, "path");
      if (!filePath) return sendError(res, "Missing path param", 400);
      return sendJson(res, { exists: fs.existsSync(filePath) });
    }

    // GET /api/files/list
    if (pathname === "/api/files/list" && req.method === "GET") {
      const dirPath = getQueryParam(url, "path");
      if (!dirPath) return sendError(res, "Missing path param", 400);
      if (!fs.existsSync(dirPath)) return sendJson(res, []);
      const entries = fs.readdirSync(dirPath).map((name) => {
        return path.join(dirPath, name);
      });
      return sendJson(res, entries);
    }

    // GET /api/files/verify
    if (pathname === "/api/files/verify" && req.method === "GET") {
      const dirPath = getQueryParam(url, "path");
      if (!dirPath) return sendError(res, "Missing path param", 400);
      let readable = false;
      let writable = false;
      try {
        fs.accessSync(dirPath, fs.constants.R_OK);
        readable = true;
      } catch {
        /* not readable */
      }
      try {
        fs.accessSync(dirPath, fs.constants.W_OK);
        writable = true;
      } catch {
        /* not writable */
      }
      return sendJson(res, { readable, writable });
    }

    // POST /api/files/mkdir
    if (pathname === "/api/files/mkdir" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req)) as { path: string };
      fs.mkdirSync(body.path, { recursive: true });
      return sendJson(res, { ok: true });
    }

    // GET /api/assets — serve image binary with correct Content-Type
    if (pathname === "/api/assets" && req.method === "GET") {
      const relativePath = getQueryParam(url, "path");
      if (!relativePath) return sendError(res, "Missing path param", 400);

      const filePath = path.resolve(relativePath);
      let data: Buffer;
      try {
        data = fs.readFileSync(filePath);
      } catch {
        return sendError(res, "File not found", 404);
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = IMAGE_MIME_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": data.length.toString(),
      });
      return res.end(data);
    }

    // POST /api/files/copy — copy file from src to dst
    if (pathname === "/api/files/copy" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req)) as {
        src: string;
        dst: string;
      };
      fs.mkdirSync(path.dirname(body.dst), { recursive: true });
      fs.copyFileSync(body.src, body.dst);
      return sendJson(res, { ok: true });
    }

    // PUT /api/files/binary — write base64-decoded data to path
    if (pathname === "/api/files/binary" && req.method === "PUT") {
      const body = JSON.parse(await parseBody(req)) as {
        path: string;
        base64Data: string;
      };
      fs.mkdirSync(path.dirname(body.path), { recursive: true });
      const buffer = Buffer.from(body.base64Data, "base64");
      fs.writeFileSync(body.path, buffer);
      return sendJson(res, { ok: true });
    }

    // GET /api/files/size — return file size in bytes
    if (pathname === "/api/files/size" && req.method === "GET") {
      const filePath = getQueryParam(url, "path");
      if (!filePath) return sendError(res, "Missing path param", 400);
      try {
        const stats = fs.statSync(filePath);
        return sendJson(res, { size: stats.size });
      } catch {
        return sendError(res, "File not found", 404);
      }
    }

    // GET/PUT /api/settings — load/save app settings
    if (pathname === "/api/settings") {
      const settingsPath = process.env.NSLNOTES_SETTINGS ??
        path.join(
          process.env.HOME ?? ".",
          ".config",
          "nslnotes",
          "settings.json",
        );

      if (req.method === "GET") {
        if (fs.existsSync(settingsPath)) {
          const content = fs.readFileSync(settingsPath, "utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(content);
        }
        return sendJson(res, {});
      }

      if (req.method === "PUT") {
        const body = await parseBody(req);
        const dir = path.dirname(settingsPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, body, "utf-8");
        return sendJson(res, { ok: true });
      }
    }

    sendError(res, "Not found", 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, message, 500);
  }
}
