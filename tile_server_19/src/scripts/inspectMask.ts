import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PNG } from "pngjs";

function usage() {
  console.error("Usage: node --import tsx src/scripts/inspectMask.ts <png path>");
}

const inputPath = process.argv[2];

if (!inputPath) {
  usage();
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), inputPath);
const inputBuffer = fs.readFileSync(resolvedPath);

function readPngBuffer(buffer: Buffer, filePath: string) {
  try {
    return PNG.sync.read(buffer);
  } catch {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "inspect-mask-"));
    const convertedPath = path.join(tempDirectory, "converted.png");

    execFileSync("sips", ["-s", "format", "png", filePath, "--out", convertedPath], {
      stdio: "ignore"
    });

    return PNG.sync.read(fs.readFileSync(convertedPath));
  }
}

const png = readPngBuffer(inputBuffer, resolvedPath);
const rgbaCounts = new Map<string, number>();
const alphaCounts = new Map<number, number>();

for (let index = 0; index < png.data.length; index += 4) {
  const r = png.data[index];
  const g = png.data[index + 1];
  const b = png.data[index + 2];
  const a = png.data[index + 3];
  const rgbaKey = `${r},${g},${b},${a}`;

  rgbaCounts.set(rgbaKey, (rgbaCounts.get(rgbaKey) ?? 0) + 1);
  alphaCounts.set(a, (alphaCounts.get(a) ?? 0) + 1);
}

const topColors = Array.from(rgbaCounts.entries())
  .sort((left, right) => right[1] - left[1])
  .slice(0, 20);
const alphaSummary = Array.from(alphaCounts.entries()).sort((left, right) => left[0] - right[0]);
const hasOnlyOpaquePixels = alphaSummary.length === 1 && alphaSummary[0]?.[0] === 255;
const hasOnlyGrayPixels = Array.from(rgbaCounts.keys()).every((rgbaKey) => {
  const [red, green, blue] = rgbaKey.split(",").slice(0, 3).map((value) => Number.parseInt(value, 10));

  return red === green && green === blue;
});

console.log(
  JSON.stringify(
    {
      alphaValues: alphaSummary,
      hasOnlyGrayPixels,
      hasOnlyOpaquePixels,
      height: png.height,
      path: resolvedPath,
      topColors,
      uniqueRgbaCount: rgbaCounts.size,
      width: png.width
    },
    null,
    2
  )
);
