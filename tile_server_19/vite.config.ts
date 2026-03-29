import tailwindcss from "@tailwindcss/vite";
import rsc from "@vitejs/plugin-rsc";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig } from "vite";

import { normalizeClipboardSlots, writeClipboardSlots } from "./src/lib/serverStore";

const CLIPBOARD_SAVE_PATH = "/__clipboard/save";

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

async function handleClipboardSave(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST" || request.url !== CLIPBOARD_SAVE_PATH) {
    return false;
  }

  try {
    const rawBody = await readRequestBody(request);
    const parsed = JSON.parse(rawBody) as Partial<{
      slots: unknown;
    }>;
    const normalizedSlots = normalizeClipboardSlots(
      Array.isArray(parsed.slots) ? parsed.slots : undefined
    );

    await writeClipboardSlots(normalizedSlots);

    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  } catch {
    response.statusCode = 400;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: false }));
  }

  return true;
}

function clipboardPersistencePlugin() {
  return {
    configurePreviewServer(server: {
      middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void };
    }) {
      server.middlewares.use((request, response, next) => {
        void handleClipboardSave(request, response).then((handled) => {
          if (!handled) {
            next();
          }
        });
      });
    },
    configureServer(server: {
      middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void };
    }) {
      server.middlewares.use((request, response, next) => {
        void handleClipboardSave(request, response).then((handled) => {
          if (!handled) {
            next();
          }
        });
      });
    },
    name: "clipboard-persistence"
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    clipboardPersistencePlugin(),
    rsc({
      entries: {
        client: "./src/framework/entry.browser.tsx",
        rsc: "./src/framework/entry.rsc.tsx",
        ssr: "./src/framework/entry.ssr.tsx"
      }
    })
  ]
});
