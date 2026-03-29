import { promises as fs } from "node:fs";
import path from "node:path";

import { isManagedOutputFile } from "./archive-output.js";
import { OUTPUT_DIR } from "./config.js";

async function main(): Promise<void> {
  let outputEntries: string[];

  try {
    outputEntries = await fs.readdir(OUTPUT_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`Output directory does not exist yet: ${OUTPUT_DIR}`);
      return;
    }

    throw error;
  }

  const filesToRemove = outputEntries.filter(isManagedOutputFile);

  if (filesToRemove.length === 0) {
    console.log(`No generated output files found in ${OUTPUT_DIR}`);
    return;
  }

  await Promise.all(
    filesToRemove.map(async (fileName) => {
      await fs.rm(path.join(OUTPUT_DIR, fileName), { force: true });
    })
  );

  console.log(
    `Removed ${filesToRemove.length} generated output files from ${OUTPUT_DIR}`
  );
}

void main();
