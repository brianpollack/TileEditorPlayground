import {
  readClipboardSlots,
  readMapRecords,
  readSpriteRecords,
  readTileLibraryFolders,
  readTileRecords
} from "../lib/serverStore";
import { getThemeCssText } from "../styles/theme";
import { TileServerApp } from "./TileServerApp";
import "../styles/app.css";

interface AppDocumentProps {
  requestUrl: string;
}

export default async function AppDocument({ requestUrl }: AppDocumentProps) {
  const url = new URL(requestUrl);
  const clipboardSlots = await readClipboardSlots();
  const tileLibraryFolders = await readTileLibraryFolders();
  const sprites = await readSpriteRecords();
  const tiles = await readTileRecords();
  const maps = await readMapRecords();
  const initialBrushTileSlug = url.searchParams.get("brush")?.trim() ?? "";
  const initialEditTileSlug = url.searchParams.get("edit")?.trim() ?? "";
  const initialImagePath = url.searchParams.get("image")?.trim() ?? "";
  const initialMapSlug = url.searchParams.get("map")?.trim() ?? "";
  const initialMode = url.searchParams.get("mode")?.trim() ?? "";
  const initialPaintEditors = url.searchParams.get("paint")?.trim() ?? "";
  const initialSpriteKey = url.searchParams.get("sprite")?.trim() ?? "";

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
          initialBrushTileSlug={initialBrushTileSlug}
          initialEditTileSlug={initialEditTileSlug}
          initialImagePath={initialImagePath}
          initialMapSlug={initialMapSlug}
          initialMode={initialMode}
          initialPaintEditors={initialPaintEditors}
          initialSpriteKey={initialSpriteKey}
          maps={maps}
          sprites={sprites}
          tileLibraryFolders={tileLibraryFolders}
          tiles={tiles}
        />
      </body>
    </html>
  );
}
