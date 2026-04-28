import {
  createTemporaryReferenceSet,
  decodeReply,
  loadServerAction,
  renderToReadableStream
} from "@vitejs/plugin-rsc/rsc";

import AppDocument from "../app/AppDocument";
import {
  createPersonalityRecord,
  createPersonalityEventRecord,
  prepareRandomPersonalityPrompt,
  randomizePersonalityThroughOpenRouter,
  createRemoteItemRecord,
  createTileRecord,
  duplicateTileRecord,
  deleteAssetRecord,
  deleteItemRecord,
  downloadPersonalityProfileImage,
  importTileFile,
  importSpriteFile,
  loadItemFieldLookups,
  moveItemRecordCategory,
  readPersonalityEventRecords,
  saveItemPreviewImage,
  saveSpriteRecord,
  updatePersonalityRecord,
  updatePersonalityEventRecord,
  updateRemoteItemRecord,
  uploadPersonalityProfileImage,
  uploadItemThumbnailFile,
  uploadItemModelFile,
  uploadItemTextureFile
} from "../lib/serverStore";
import type { ItemRecord, PersonalityEventRecord, PersonalityRecord, SpriteRecord } from "../types";

const CREATE_TILE_PATH = "/__tiles/create";
const DUPLICATE_TILE_PATH = "/__tiles/duplicate";
const DELETE_ASSET_PATH = "/__tiles/delete-asset";
const IMPORT_TILE_PATH = "/__tiles/import-tile";
const CREATE_ITEM_PATH = "/__items/create";
const DELETE_ITEM_PATH = "/__items/delete";
const ITEM_LOOKUPS_PATH = "/__items/lookups";
const MOVE_ITEM_PATH = "/__items/move";
const SAVE_ITEM_IMAGE_PATH = "/__items/save-image";
const UPDATE_ITEM_PATH = "/__items/update";
const UPLOAD_ITEM_IMAGE_PATH = "/__items/upload-image";
const UPLOAD_ITEM_MODEL_PATH = "/__items/upload-model";
const UPLOAD_ITEM_TEXTURE_PATH = "/__items/upload-texture";
const CREATE_PERSONALITY_PATH = "/__personalities/create";
const CREATE_PERSONALITY_EVENT_PATH = "/__personalities/events/create";
const LIST_PERSONALITY_EVENTS_PATH = "/__personalities/events/list";
const PREPARE_RANDOM_PERSONALITY_PROMPT_PATH = "/__personalities/randomize-prompt";
const RANDOMIZE_PERSONALITY_PATH = "/__personalities/randomize";
const PERSONALITY_PROFILE_IMAGE_PATH_PREFIX = "/__personalities/profile/";
const UPLOAD_PERSONALITY_PROFILE_PATH = "/__personalities/upload-profile";
const UPDATE_PERSONALITY_EVENT_PATH = "/__personalities/events/update";
const UPDATE_PERSONALITY_PATH = "/__personalities/update";
const IMPORT_SPRITE_PATH = "/__tiles/import-sprite";
const SAVE_SPRITE_PATH = "/__tiles/save-sprite";
const LUA_API_HELPER_PATH = "/__lua/api-helper";
const LUA_API_HELPER_SOURCE_URL = "https://vax.protovateai.com/lua_api_helper.json";
const VAX_PROXY_PATH_PREFIX = "/__vax-proxy";
const VAX_PROXY_ORIGIN = "https://vax.protovateai.com";

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
      const requestBody = (await request.json()) as Partial<{
        impassible: boolean;
        name: string;
        path: string;
      }>;
      const createdTile = await createTileRecord(
        requestBody.name ?? "",
        requestBody.path ?? "",
        requestBody.impassible ?? false
      );

      return Response.json(createdTile);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not create tile.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === DUPLICATE_TILE_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ name: string; slug: string }>;
      const duplicatedTile = await duplicateTileRecord({
        name: requestBody.name ?? "",
        slug: requestBody.slug ?? ""
      });

      return Response.json(duplicatedTile);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not duplicate tile.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === DELETE_ASSET_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{
        assetType: "sprite" | "tile";
        filename: string;
        path: string;
        slug: string;
      }>;
      const deletedAsset = await deleteAssetRecord({
        assetType: requestBody.assetType ?? "tile",
        filename: requestBody.filename,
        path: requestBody.path,
        slug: requestBody.slug
      });

      return Response.json(deletedAsset);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not delete asset.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === IMPORT_TILE_PATH) {
    try {
      const formData = await request.formData();
      const tileFile = formData.get("file");
      const tilePath = formData.get("path");

      if (!(tileFile instanceof File)) {
        throw new Error("Choose a PNG file to import.");
      }

      if (typeof tilePath !== "string") {
        throw new Error("Choose a tile library folder before importing a tile.");
      }

      const importedTile = await importTileFile(tileFile, tilePath);

      return Response.json(importedTile);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not import tile.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === CREATE_ITEM_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ itemType: string; name: string }>;
      const createdItem = await createRemoteItemRecord(requestBody.name ?? "", requestBody.itemType ?? "");

      return Response.json(createdItem satisfies ItemRecord);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not create item.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === DELETE_ITEM_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ id: number }>;
      const deletedItem = await deleteItemRecord(Number(requestBody.id));

      return Response.json(deletedItem);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not delete item.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "GET" && requestUrl.pathname === ITEM_LOOKUPS_PATH) {
    try {
      const lookups = await loadItemFieldLookups();

      return Response.json(lookups);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not load item lookups.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === MOVE_ITEM_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ id: number; itemType: string }>;
      const updatedItem = await moveItemRecordCategory(Number(requestBody.id), requestBody.itemType ?? "");

      return Response.json(updatedItem satisfies ItemRecord);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not move item.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === UPDATE_ITEM_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{
        base_value: number | null;
        description: string | null;
        durability: number | null;
        gives_light: number | null;
        id: number;
        is_consumable: boolean | null;
        is_container: boolean | null;
        level: number | null;
        long_description: string | null;
        mount_point: string | null;
        quality: string | null;
        rarity: string | null;
        storage_capacity: number | null;
        weapon_grip: string | null;
      }>;
      const nextFields: Partial<
        Pick<
          ItemRecord,
          "base_value" | "description" | "durability" | "gives_light" | "is_consumable" | "is_container" | "level" | "long_description" | "mount_point" | "quality" | "rarity" | "storage_capacity" | "weapon_grip"
        >
      > = {};

      if ("base_value" in requestBody) {
        nextFields.base_value = requestBody.base_value ?? null;
      }

      if ("description" in requestBody) {
        nextFields.description = requestBody.description ?? null;
      }

      if ("durability" in requestBody) {
        nextFields.durability = requestBody.durability ?? null;
      }

      if ("gives_light" in requestBody) {
        nextFields.gives_light = requestBody.gives_light ?? null;
      }

      if ("is_consumable" in requestBody) {
        nextFields.is_consumable = requestBody.is_consumable ?? null;
      }

      if ("is_container" in requestBody) {
        nextFields.is_container = requestBody.is_container ?? null;
      }

      if ("level" in requestBody) {
        nextFields.level = requestBody.level ?? null;
      }

      if ("long_description" in requestBody) {
        nextFields.long_description = requestBody.long_description ?? null;
      }

      if ("mount_point" in requestBody) {
        nextFields.mount_point = requestBody.mount_point ?? null;
      }

      if ("quality" in requestBody) {
        nextFields.quality = requestBody.quality ?? null;
      }

      if ("rarity" in requestBody) {
        nextFields.rarity = requestBody.rarity ?? null;
      }

      if ("storage_capacity" in requestBody) {
        nextFields.storage_capacity = requestBody.storage_capacity ?? null;
      }

      if ("weapon_grip" in requestBody) {
        nextFields.weapon_grip = requestBody.weapon_grip ?? null;
      }

      const updatedItem = await updateRemoteItemRecord(Number(requestBody.id), nextFields);

      return Response.json(updatedItem satisfies ItemRecord);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not update item.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === CREATE_PERSONALITY_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ name: string }>;
      const createdPersonality = await createPersonalityRecord(requestBody.name ?? "");

      return Response.json(createdPersonality satisfies PersonalityRecord);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not create personality.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === PREPARE_RANDOM_PERSONALITY_PROMPT_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ character_slug: string }>;
      const preparedPrompt = await prepareRandomPersonalityPrompt(requestBody.character_slug ?? "");

      return Response.json(preparedPrompt);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not prepare random personality prompt.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === RANDOMIZE_PERSONALITY_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ character_slug: string; model: string; prompt: string }>;
      const updatedPersonality = await randomizePersonalityThroughOpenRouter(
        requestBody.character_slug ?? "",
        requestBody.prompt ?? "",
        requestBody.model ?? ""
      );

      return Response.json(updatedPersonality satisfies PersonalityRecord);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not randomize personality.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (
    request.method === "GET" &&
    requestUrl.pathname.startsWith(PERSONALITY_PROFILE_IMAGE_PATH_PREFIX) &&
    requestUrl.pathname.endsWith(".jpg")
  ) {
    try {
      const fileName = requestUrl.pathname.slice(PERSONALITY_PROFILE_IMAGE_PATH_PREFIX.length);
      const characterSlug = fileName.slice(0, -4);
      const imageResponse = await downloadPersonalityProfileImage(characterSlug);
      const responseHeaders = new Headers({
        "Cache-Control": "private, max-age=60",
        "Content-Type": imageResponse.contentType
      });

      if (imageResponse.etag) {
        responseHeaders.set("ETag", imageResponse.etag);
      }

      if (imageResponse.lastModified) {
        responseHeaders.set("Last-Modified", imageResponse.lastModified);
      }

      return new Response(imageResponse.body, {
        headers: responseHeaders,
        status: 200
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not load profile image.";
      const status = message === "Profile image not found." ? 404 : 400;

      return Response.json({ error: message }, { status });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === UPDATE_PERSONALITY_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<PersonalityRecord> & {
        character_slug?: string;
      };

      const updatedPersonality = await updatePersonalityRecord(requestBody.character_slug ?? "", requestBody);

      return Response.json(updatedPersonality satisfies PersonalityRecord);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not update personality.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === LIST_PERSONALITY_EVENTS_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ character_slug: string }>;
      const events = await readPersonalityEventRecords(requestBody.character_slug ?? "");

      return Response.json({ events: events satisfies PersonalityEventRecord[] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not load personality events.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === CREATE_PERSONALITY_EVENT_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ character_slug: string }>;
      const event = await createPersonalityEventRecord(requestBody.character_slug ?? "");

      return Response.json(event satisfies PersonalityEventRecord);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not create personality event.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === UPDATE_PERSONALITY_EVENT_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<PersonalityEventRecord> & {
        character_slug?: string;
      };
      const event = await updatePersonalityEventRecord(requestBody.character_slug ?? "", requestBody);

      return Response.json(event satisfies PersonalityEventRecord);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not update personality event.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === UPLOAD_PERSONALITY_PROFILE_PATH) {
    try {
      const formData = await request.formData();
      const imageFile = formData.get("file");
      const characterSlug = formData.get("character_slug");

      if (!(imageFile instanceof File)) {
        throw new Error("Choose an image file to upload.");
      }

      if (typeof characterSlug !== "string") {
        throw new Error("Character slug is required.");
      }

      const updatedPersonality = await uploadPersonalityProfileImage(characterSlug, imageFile);

      return Response.json(updatedPersonality satisfies PersonalityRecord);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not upload profile image.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === SAVE_ITEM_IMAGE_PATH) {
    try {
      const requestBody = (await request.json()) as Partial<{ id: number; imageDataUrl: string }>;
      const saveResult = await saveItemPreviewImage(Number(requestBody.id), requestBody.imageDataUrl ?? "");

      return Response.json(saveResult);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not replace item image.";

      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === UPLOAD_ITEM_IMAGE_PATH) {
    try {
      const formData = await request.formData();
      const imageFile = formData.get("file");
      const itemId = formData.get("id");

      if (!(imageFile instanceof File)) {
        throw new Error("Choose an image file to upload.");
      }

      if (typeof itemId !== "string") {
        throw new Error("Item id is required.");
      }

      const uploadResult = await uploadItemThumbnailFile(Number(itemId), imageFile);
      return Response.json(uploadResult);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not upload item image.";
      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === UPLOAD_ITEM_MODEL_PATH) {
    try {
      const formData = await request.formData();
      const modelFile = formData.get("file");
      const itemId = formData.get("id");

      if (!(modelFile instanceof File)) {
        throw new Error("Choose a GLB or GLTF file to upload.");
      }

      if (typeof itemId !== "string") {
        throw new Error("Item id is required.");
      }

      const uploadResult = await uploadItemModelFile(Number(itemId), modelFile);
      return Response.json(uploadResult);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not upload model.";
      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === UPLOAD_ITEM_TEXTURE_PATH) {
    try {
      const formData = await request.formData();
      const textureFile = formData.get("file");
      const itemId = formData.get("id");

      if (!(textureFile instanceof File)) {
        throw new Error("Choose a PNG file to upload.");
      }

      if (typeof itemId !== "string") {
        throw new Error("Item id is required.");
      }

      const uploadResult = await uploadItemTextureFile(Number(itemId), textureFile);
      return Response.json(uploadResult);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not upload texture.";
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

  if (request.method === "GET" && requestUrl.pathname === LUA_API_HELPER_PATH) {
    try {
      const upstreamResponse = await fetch(LUA_API_HELPER_SOURCE_URL, {
        headers: {
          accept: "application/json"
        }
      });

      if (!upstreamResponse.ok) {
        throw new Error(`Could not load Lua API helper (${upstreamResponse.status}).`);
      }

      const helperPayload = await upstreamResponse.json();

      return Response.json(helperPayload, {
        headers: {
          "Cache-Control": "public, max-age=300"
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not load Lua API helper.";

      return Response.json({ error: message }, { status: 502 });
    }
  }

  if (
    (request.method === "GET" || request.method === "HEAD") &&
    requestUrl.pathname.startsWith(`${VAX_PROXY_PATH_PREFIX}/`)
  ) {
    try {
      const upstreamPath = requestUrl.pathname.slice(VAX_PROXY_PATH_PREFIX.length);
      const upstreamUrl = new URL(`${VAX_PROXY_ORIGIN}${upstreamPath}${requestUrl.search}`);
      const upstreamResponse = await fetch(upstreamUrl, {
        headers: {
          accept: request.headers.get("accept") ?? "*/*"
        }
      });

      if (request.method === "HEAD") {
        const headHeaders = new Headers();
        const headContentType = upstreamResponse.headers.get("content-type");
        const headCacheControl = upstreamResponse.headers.get("cache-control");

        if (headContentType) {
          headHeaders.set("Content-Type", headContentType);
        }

        if (headCacheControl) {
          headHeaders.set("Cache-Control", headCacheControl);
        }

        return new Response(null, {
          headers: headHeaders,
          status: upstreamResponse.status
        });
      }

      if (!upstreamResponse.ok) {
        return new Response(upstreamResponse.body, {
          headers: {
            "Content-Type": upstreamResponse.headers.get("content-type") ?? "application/octet-stream"
          },
          status: upstreamResponse.status
        });
      }

      const responseHeaders = new Headers();
      const contentType = upstreamResponse.headers.get("content-type");
      const cacheControl = upstreamResponse.headers.get("cache-control");
      const etag = upstreamResponse.headers.get("etag");
      const lastModified = upstreamResponse.headers.get("last-modified");

      if (contentType) {
        responseHeaders.set("Content-Type", contentType);
      }

      if (cacheControl) {
        responseHeaders.set("Cache-Control", cacheControl);
      } else {
        responseHeaders.set("Cache-Control", "public, max-age=300");
      }

      if (etag) {
        responseHeaders.set("ETag", etag);
      }

      if (lastModified) {
        responseHeaders.set("Last-Modified", lastModified);
      }

      return new Response(upstreamResponse.body, {
        headers: responseHeaders,
        status: upstreamResponse.status
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not load Vax asset.";

      return Response.json({ error: message }, { status: 502 });
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
