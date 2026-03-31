import {
  createTemporaryReferenceSet,
  decodeReply,
  loadServerAction,
  renderToReadableStream
} from "@vitejs/plugin-rsc/rsc";

import AppDocument from "../app/AppDocument";
import { createTileRecord, importSpriteFile, saveSpriteRecord } from "../lib/serverStore";
import type { SpriteRecord } from "../types";

const CREATE_TILE_PATH = "/__tiles/create";
const IMPORT_SPRITE_PATH = "/__tiles/import-sprite";
const SAVE_SPRITE_PATH = "/__tiles/save-sprite";

function getHtmlRequestUrl(request: Request) {
  const url = new URL(request.url);

  if (url.pathname.endsWith(".rsc")) {
    url.pathname = url.pathname.slice(0, -4) || "/";
  }

  return url.toString();
}

export default async function handler(request: Request) {
  const requestUrl = new URL(request.url);

  if (request.method === "POST" && requestUrl.pathname === CREATE_TILE_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ name: string; path: string }>;
      const createdTile = await createTileRecord(requestBody.name ?? "", requestBody.path ?? "");

      return Response.json(createdTile);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not create tile.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === IMPORT_SPRITE_PATH) {
    try {
      const formData = await request.formData();
      const spriteFile = formData.get("file");
      const spritePath = formData.get("path");

      if (!(spriteFile instanceof File)) {
        throw new Error("Choose a PNG file to import.");
      }

      if (typeof spritePath !== "string") {
        throw new Error("Choose a tile library folder before importing a sprite.");
      }

      const importedSprite = await importSpriteFile(spriteFile, spritePath);

      return Response.json(importedSprite);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not import sprite.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === SAVE_SPRITE_PATH) {
    try {
      const formData = await request.formData();
      const replacementFile = formData.get("file");
      const sprite = formData.get("sprite");

      if (typeof sprite !== "string") {
        throw new Error("Sprite payload is required.");
      }

      const savedSprite = await saveSpriteRecord(
        JSON.parse(sprite) as SpriteRecord,
        replacementFile instanceof File ? replacementFile : null
      );

      return Response.json(savedSprite);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not save sprite.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  const isAction = request.method === "POST";
  const isRscRequest =
    requestUrl.pathname.endsWith(".rsc") ||
    request.headers.get("accept")?.includes("text/x-component") ||
    isAction;
  let returnValue: unknown;
  let temporaryReferences: unknown;

  if (isAction) {
    const actionId = request.headers.get("x-rsc-action");

    if (actionId) {
      const requestBody = request.headers.get("content-type")?.startsWith("multipart/form-data")
        ? await request.formData()
        : await request.text();

      temporaryReferences = createTemporaryReferenceSet();
      const args = await decodeReply(requestBody, { temporaryReferences });

      returnValue = await (await loadServerAction(actionId)).apply(null, args as unknown[]);
    }
  }

  const rscStream = renderToReadableStream(
    {
      returnValue,
      root: <AppDocument requestUrl={getHtmlRequestUrl(request)} />
    },
    { temporaryReferences }
  );

  if (isRscRequest) {
    return new Response(rscStream, {
      headers: {
        "content-type": "text/x-component;charset=utf-8",
        vary: "accept"
      }
    });
  }

  const ssrEntry = await import.meta.viteRsc.import<typeof import("./entry.ssr.tsx")>(
    "./entry.ssr.tsx",
    { environment: "ssr" }
  );
  const htmlStream = await ssrEntry.handleSsr(rscStream);

  return new Response(htmlStream, {
    headers: {
      "content-type": "text/html;charset=utf-8",
      vary: "accept"
    }
  });
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
