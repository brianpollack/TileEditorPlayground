import { promises as fs } from "node:fs";

import { intToRGBA, Jimp, rgbaToInt } from "jimp";

import { TILE_X, TILE_Y, type TileGrid } from "./TerrainTemplateGenerate.js";

export const COMPARE_BORDER_INSET = 10;
// Current keep set has a clean break between 0.081595 (good) and 0.087269 (bad).
export const AUTO_KEEP_THRESHOLD = 0.085;
export const MIX_GENERATED_ALPHA = 0.5;

const MAX_CHROMA_DISTANCE = Math.sqrt(2);

interface RgbaColor {
  a: number;
  b: number;
  g: number;
  r: number;
}

export interface ImageComparisonResult {
  border_inset: number;
  generated_height: number;
  generated_width: number;
  reference_height: number;
  reference_width: number;
  tile_errors: number[][];
  tile_height: number;
  tile_width: number;
  total_error: number;
}

interface ChannelStatistics {
  blueMean: number;
  blueStdDev: number;
  greenMean: number;
  greenStdDev: number;
  redMean: number;
  redStdDev: number;
}

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function roundError(value: number): number {
  return Number(value.toFixed(6));
}

function normalizedChromaticity(color: RgbaColor): [number, number, number] {
  const alphaMultiplier = color.a / 255;
  const red = (color.r / 255) * alphaMultiplier;
  const green = (color.g / 255) * alphaMultiplier;
  const blue = (color.b / 255) * alphaMultiplier;
  const intensity = red + green + blue;

  if (intensity <= 0.000001) {
    return [0, 0, 0];
  }

  return [red / intensity, green / intensity, blue / intensity];
}

function pixelColorError(source: RgbaColor, generated: RgbaColor): number {
  const [sourceR, sourceG, sourceB] = normalizedChromaticity(source);
  const [generatedR, generatedG, generatedB] = normalizedChromaticity(generated);
  const chromaDistance = Math.hypot(
    sourceR - generatedR,
    sourceG - generatedG,
    sourceB - generatedB
  );

  return clamp01(chromaDistance / MAX_CHROMA_DISTANCE);
}

function computeChannelStatistics(image: JimpImage): ChannelStatistics {
  const pixelCount = image.width * image.height;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = intToRGBA(image.getPixelColor(x, y));
      redTotal += pixel.r;
      greenTotal += pixel.g;
      blueTotal += pixel.b;
    }
  }

  const redMean = redTotal / pixelCount;
  const greenMean = greenTotal / pixelCount;
  const blueMean = blueTotal / pixelCount;
  let redVarianceTotal = 0;
  let greenVarianceTotal = 0;
  let blueVarianceTotal = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = intToRGBA(image.getPixelColor(x, y));
      redVarianceTotal += (pixel.r - redMean) ** 2;
      greenVarianceTotal += (pixel.g - greenMean) ** 2;
      blueVarianceTotal += (pixel.b - blueMean) ** 2;
    }
  }

  return {
    blueMean,
    blueStdDev: Math.sqrt(blueVarianceTotal / pixelCount),
    greenMean,
    greenStdDev: Math.sqrt(greenVarianceTotal / pixelCount),
    redMean,
    redStdDev: Math.sqrt(redVarianceTotal / pixelCount)
  };
}

function normalizeChannel(
  value: number,
  sourceMean: number,
  sourceStdDev: number,
  targetMean: number,
  targetStdDev: number
): number {
  const safeSourceStdDev = sourceStdDev < 0.000001 ? 1 : sourceStdDev;
  const safeTargetStdDev = targetStdDev < 0.000001 ? 1 : targetStdDev;

  return targetMean + ((value - sourceMean) / safeSourceStdDev) * safeTargetStdDev;
}

export async function compareReferenceToGeneratedImage(input: {
  generatedImagePath: string;
  referenceImagePath: string;
  tileGrid: TileGrid;
}): Promise<ImageComparisonResult> {
  const referenceImage = await Jimp.read(input.referenceImagePath);
  const generatedImage = await Jimp.read(input.generatedImagePath);
  const referenceWidth = input.tileGrid.width * TILE_X;
  const referenceHeight = input.tileGrid.height * TILE_Y;

  generatedImage.resize({ h: referenceHeight, w: referenceWidth });

  const tileErrors: number[][] = [];
  let totalPixelError = 0;
  let totalPixelCount = 0;

  for (let tileY = 0; tileY < input.tileGrid.height; tileY += 1) {
    const rowErrors: number[] = [];

    for (let tileX = 0; tileX < input.tileGrid.width; tileX += 1) {
      const startX = tileX * TILE_X + COMPARE_BORDER_INSET;
      const endX = (tileX + 1) * TILE_X - COMPARE_BORDER_INSET;
      const startY = tileY * TILE_Y + COMPARE_BORDER_INSET;
      const endY = (tileY + 1) * TILE_Y - COMPARE_BORDER_INSET;
      let tilePixelError = 0;
      let tilePixelCount = 0;

      for (let pixelY = startY; pixelY < endY; pixelY += 1) {
        for (let pixelX = startX; pixelX < endX; pixelX += 1) {
          const sourceColor = intToRGBA(referenceImage.getPixelColor(pixelX, pixelY));
          const generatedColor = intToRGBA(generatedImage.getPixelColor(pixelX, pixelY));
          const pixelError = pixelColorError(sourceColor, generatedColor);

          tilePixelError += pixelError;
          tilePixelCount += 1;
        }
      }

      const averageTileError =
        tilePixelCount > 0 ? tilePixelError / tilePixelCount : 0;

      rowErrors.push(roundError(averageTileError));
      totalPixelError += tilePixelError;
      totalPixelCount += tilePixelCount;
    }

    tileErrors.push(rowErrors);
  }

  const totalError = totalPixelCount > 0 ? totalPixelError / totalPixelCount : 0;

  return {
    border_inset: COMPARE_BORDER_INSET,
    generated_height: generatedImage.height,
    generated_width: generatedImage.width,
    reference_height: referenceHeight,
    reference_width: referenceWidth,
    tile_errors: tileErrors,
    tile_height: TILE_Y,
    tile_width: TILE_X,
    total_error: roundError(totalError)
  };
}

export async function writeMixImage(input: {
  generatedImagePath: string;
  mixImagePath: string;
  referenceImagePath: string;
  tileGrid: TileGrid;
}): Promise<void> {
  const referenceImage = await Jimp.read(input.referenceImagePath);
  const generatedImage = await Jimp.read(input.generatedImagePath);
  const referenceWidth = input.tileGrid.width * TILE_X;
  const referenceHeight = input.tileGrid.height * TILE_Y;
  const referenceWeight = 1 - MIX_GENERATED_ALPHA;

  referenceImage.resize({ h: referenceHeight, w: referenceWidth });
  generatedImage.resize({ h: referenceHeight, w: referenceWidth });

  for (let y = 0; y < referenceHeight; y += 1) {
    for (let x = 0; x < referenceWidth; x += 1) {
      const referencePixel = intToRGBA(referenceImage.getPixelColor(x, y));
      const generatedPixel = intToRGBA(generatedImage.getPixelColor(x, y));
      const blendedPixel = {
        a: 255,
        b: Math.round(
          referencePixel.b * referenceWeight + generatedPixel.b * MIX_GENERATED_ALPHA
        ),
        g: Math.round(
          referencePixel.g * referenceWeight + generatedPixel.g * MIX_GENERATED_ALPHA
        ),
        r: Math.round(
          referencePixel.r * referenceWeight + generatedPixel.r * MIX_GENERATED_ALPHA
        )
      };

      referenceImage.setPixelColor(
        rgbaToInt(
          blendedPixel.r,
          blendedPixel.g,
          blendedPixel.b,
          blendedPixel.a
        ),
        x,
        y
      );
    }
  }

  await fs.writeFile(input.mixImagePath, await referenceImage.getBuffer("image/png"));
}

export async function writeBalancedImage(input: {
  balancedImagePath: string;
  generatedImagePath: string;
  referenceImagePath: string;
  tileGrid: TileGrid;
}): Promise<void> {
  const referenceImage = await Jimp.read(input.referenceImagePath);
  const generatedImage = await Jimp.read(input.generatedImagePath);
  const referenceWidth = input.tileGrid.width * TILE_X;
  const referenceHeight = input.tileGrid.height * TILE_Y;

  referenceImage.resize({ h: referenceHeight, w: referenceWidth });
  generatedImage.resize({ h: referenceHeight, w: referenceWidth });

  const referenceStats = computeChannelStatistics(referenceImage);
  const generatedStats = computeChannelStatistics(generatedImage);

  for (let y = 0; y < referenceHeight; y += 1) {
    for (let x = 0; x < referenceWidth; x += 1) {
      const generatedPixel = intToRGBA(generatedImage.getPixelColor(x, y));
      const balancedPixel = {
        a: generatedPixel.a,
        b: clampChannel(
          normalizeChannel(
            generatedPixel.b,
            generatedStats.blueMean,
            generatedStats.blueStdDev,
            referenceStats.blueMean,
            referenceStats.blueStdDev
          )
        ),
        g: clampChannel(
          normalizeChannel(
            generatedPixel.g,
            generatedStats.greenMean,
            generatedStats.greenStdDev,
            referenceStats.greenMean,
            referenceStats.greenStdDev
          )
        ),
        r: clampChannel(
          normalizeChannel(
            generatedPixel.r,
            generatedStats.redMean,
            generatedStats.redStdDev,
            referenceStats.redMean,
            referenceStats.redStdDev
          )
        )
      };

      generatedImage.setPixelColor(
        rgbaToInt(
          balancedPixel.r,
          balancedPixel.g,
          balancedPixel.b,
          balancedPixel.a
        ),
        x,
        y
      );
    }
  }

  await fs.writeFile(
    input.balancedImagePath,
    await generatedImage.getBuffer("image/png")
  );
}

export async function writeErrorReport(
  filePath: string,
  report: ImageComparisonResult & {
    decision: "fail" | "keep";
    threshold: number;
  }
): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
