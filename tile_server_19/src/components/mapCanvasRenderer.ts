import type { MapTileOptions } from "../types";

export function ensureCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width) {
    canvas.width = width;
  }

  if (canvas.height !== height) {
    canvas.height = height;
  }
}

export function getRenderedTilePlacementCanvas(input: {
  drawFallback(context: CanvasRenderingContext2D): void;
  fallbackCanvasKey: string;
  fallbackTileCanvasCache: Map<string, HTMLCanvasElement>;
  getRotationDegrees(options: Partial<MapTileOptions> | undefined): number;
  options: MapTileOptions;
  renderedPlacementCanvasCache: Map<string, HTMLCanvasElement>;
  sourceKey: string;
  tileImage: HTMLImageElement | null;
  tileSize: number;
  variantKey: string;
}) {
  const cachedVariant = input.renderedPlacementCanvasCache.get(input.variantKey);

  if (cachedVariant) {
    return cachedVariant;
  }

  const baseCanvasKey = input.tileImage ? `image:${input.sourceKey}` : input.fallbackCanvasKey;
  let baseCanvas = input.fallbackTileCanvasCache.get(baseCanvasKey) ?? null;

  if (!baseCanvas) {
    baseCanvas = document.createElement("canvas");
    ensureCanvasSize(baseCanvas, input.tileSize, input.tileSize);
    const baseContext = baseCanvas.getContext("2d");

    if (!baseContext) {
      return null;
    }

    baseContext.clearRect(0, 0, input.tileSize, input.tileSize);

    if (input.tileImage) {
      baseContext.drawImage(input.tileImage, 0, 0, input.tileSize, input.tileSize);
    } else {
      input.drawFallback(baseContext);
    }

    input.fallbackTileCanvasCache.set(baseCanvasKey, baseCanvas);
  }

  const variantCanvas = document.createElement("canvas");
  ensureCanvasSize(variantCanvas, input.tileSize, input.tileSize);
  const variantContext = variantCanvas.getContext("2d");

  if (!variantContext) {
    return null;
  }

  variantContext.clearRect(0, 0, input.tileSize, input.tileSize);
  variantContext.save();
  variantContext.translate(input.tileSize / 2, input.tileSize / 2);
  variantContext.scale(
    input.options.flipHorizontal ? -1 : 1,
    input.options.flipVertical ? -1 : 1
  );
  variantContext.rotate((input.getRotationDegrees(input.options) * Math.PI) / 180);
  variantContext.drawImage(
    baseCanvas,
    -input.tileSize / 2,
    -input.tileSize / 2,
    input.tileSize,
    input.tileSize
  );
  variantContext.restore();

  if (input.options.multiply) {
    const multipliedCanvas = document.createElement("canvas");
    ensureCanvasSize(multipliedCanvas, input.tileSize, input.tileSize);
    const multipliedContext = multipliedCanvas.getContext("2d");

    if (!multipliedContext) {
      return null;
    }

    multipliedContext.drawImage(variantCanvas, 0, 0);
    multipliedContext.globalCompositeOperation = "multiply";
    multipliedContext.fillStyle = input.options.colorValue;
    multipliedContext.fillRect(0, 0, input.tileSize, input.tileSize);
    multipliedContext.globalCompositeOperation = "destination-in";
    multipliedContext.drawImage(variantCanvas, 0, 0);
    variantContext.clearRect(0, 0, input.tileSize, input.tileSize);
    variantContext.drawImage(multipliedCanvas, 0, 0);
  }

  if (input.options.color) {
    variantContext.save();
    variantContext.globalAlpha = input.options.multiply ? 0.35 : 1;
    variantContext.globalCompositeOperation = "source-atop";
    variantContext.fillStyle = input.options.colorValue;
    variantContext.fillRect(0, 0, input.tileSize, input.tileSize);
    variantContext.restore();
  }

  input.renderedPlacementCanvasCache.set(input.variantKey, variantCanvas);

  return variantCanvas;
}
