import {
  getAssetDatabaseStatus,
  readClipboardSlots,
  readItemRecords,
  readTileLibraryFolderAssetCounts,
  readMapRecords,
  readPersonalityRecords,
  readSpriteRecords,
  readTileLibraryFolders,
  readTileRecords
} from "../lib/serverStore";
import { getVaxServer } from "../lib/env";
import { getThemeCssText } from "../styles/theme";
import { TileServerApp } from "./TileServerApp";
import "../styles/app.css";

interface AppDocumentProps {
  requestUrl: string;
}

export default async function AppDocument({ requestUrl }: AppDocumentProps) {
  const databaseStatus = await getAssetDatabaseStatus();

  if (!databaseStatus.available) {
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta content="width=device-width, initial-scale=1" name="viewport" />
          <title>Tile Server 19</title>
          <style>{getThemeCssText()}</style>
        </head>
        <body>
          <main className="min-h-screen theme-bg-paper-soft px-6 py-10 theme-text-primary">
            <p className="mx-auto max-w-2xl text-lg font-semibold">{databaseStatus.message}</p>
          </main>
        </body>
      </html>
    );
  }

  const url = new URL(requestUrl);
  const clipboardSlots = await readClipboardSlots();
  const tileLibraryFolderAssetCounts = await readTileLibraryFolderAssetCounts();
  const tileLibraryFolders = await readTileLibraryFolders();
  const sprites = await readSpriteRecords();
  const tiles = await readTileRecords();
  const maps = await readMapRecords();
  const initialBrushAssetKey = url.searchParams.get("brush")?.trim() ?? "";
  const initialEditTileSlug = url.searchParams.get("edit")?.trim() ?? "";
  const initialImagePath = url.searchParams.get("image")?.trim() ?? "";
  const initialItemId = url.searchParams.get("item")?.trim() ?? "";
  const initialMapSlug = url.searchParams.get("map")?.trim() ?? "";
  const initialMode = url.searchParams.get("mode")?.trim() ?? "";
  const initialPaintEditors = url.searchParams.get("paint")?.trim() ?? "";
  const initialPersonalitySlug = url.searchParams.get("personality")?.trim() ?? "";
  const initialSpriteKey = url.searchParams.get("sprite")?.trim() ?? "";
  const items = await readItemRecords();
  const personalities = await readPersonalityRecords();
  const vaxServer = getVaxServer();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta
          content="React 19 tile library and map workshop powered by server-side functions."
          name="description"
        />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
        <title>Tile Server 19</title>
        <style>{getThemeCssText()}</style>
      </head>
      <body>
        <TileServerApp
          clipboardSlots={clipboardSlots}
          initialBrushAssetKey={initialBrushAssetKey}
          initialEditTileSlug={initialEditTileSlug}
          initialImagePath={initialImagePath}
          initialItemId={initialItemId}
          initialMapSlug={initialMapSlug}
          initialMode={initialMode}
          initialPaintEditors={initialPaintEditors}
          initialPersonalitySlug={initialPersonalitySlug}
          initialSpriteKey={initialSpriteKey}
          items={items}
          maps={maps}
          personalities={personalities}
          sprites={sprites}
          tileLibraryFolderAssetCounts={tileLibraryFolderAssetCounts}
          tileLibraryFolders={tileLibraryFolders}
          tiles={tiles}
          vaxServer={vaxServer}
        />
      </body>
    </html>
  );
}
