import { promises as fs } from "node:fs";
import path from "node:path";

import { OUTPUT_DIR, PROJECT_ROOT } from "./config.js";

export const KEEP_ROOT = path.join(PROJECT_ROOT, "keep");
export const FAIL_ROOT = path.join(PROJECT_ROOT, "fail");

export function isManagedOutputFile(fileName: string): boolean {
  return (
    fileName.endsWith(".png") ||
    fileName.endsWith(".inprompt.md") ||
    fileName.endsWith(".prompt.txt") ||
    fileName.endsWith(".map.txt") ||
    fileName.endsWith(".error.json")
  );
}

export async function getLowestUnusedNumberedDirectory(
  rootDirectory: string
): Promise<string> {
  await fs.mkdir(rootDirectory, { recursive: true });

  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  const usedNumbers = new Set<number>();

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const parsedNumber = Number.parseInt(entry.name, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > 0) {
      usedNumbers.add(parsedNumber);
    }
  }

  let candidate = 1;

  while (usedNumbers.has(candidate)) {
    candidate += 1;
  }

  return path.join(rootDirectory, String(candidate));
}

export async function moveFilesToDirectory(
  filePaths: string[],
  destinationDirectory: string
): Promise<string[]> {
  await fs.mkdir(destinationDirectory, { recursive: true });

  const movedPaths: string[] = [];

  for (const filePath of filePaths) {
    const destinationPath = path.join(destinationDirectory, path.basename(filePath));
    await fs.rename(filePath, destinationPath);
    movedPaths.push(destinationPath);
  }

  return movedPaths;
}

export async function listManagedOutputFiles(): Promise<string[]> {
  const outputEntries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true });

  return outputEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isManagedOutputFile);
}
