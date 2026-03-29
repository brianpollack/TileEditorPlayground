import { promises as fs } from "node:fs";
import path from "node:path";

import {
  getLowestUnusedNumberedDirectory,
  isManagedOutputFile,
  KEEP_ROOT
} from "./archive-output.js";
import { OUTPUT_DIR } from "./config.js";

function resolveRequiredRegex(): RegExp {
  const pattern = process.argv[2];

  if (!pattern) {
    throw new Error("Usage: npm run keep -- <regexp>");
  }

  try {
    return new RegExp(pattern, "i");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid keep regex "${pattern}": ${message}`, { cause: error });
  }
}

async function main(): Promise<void> {
  const regex = resolveRequiredRegex();
  const outputEntries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true });
  const matchingFiles = outputEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => isManagedOutputFile(fileName) && regex.test(fileName));

  if (matchingFiles.length === 0) {
    console.log(`No output files matched ${regex} in ${OUTPUT_DIR}`);
    return;
  }

  const targetDirectory = await getLowestUnusedNumberedDirectory(KEEP_ROOT);
  await fs.mkdir(targetDirectory, { recursive: true });

  for (const fileName of matchingFiles) {
    await fs.rename(
      path.join(OUTPUT_DIR, fileName),
      path.join(targetDirectory, fileName)
    );
  }

  console.log(`Moved ${matchingFiles.length} files to ${targetDirectory}`);
}

void main();
