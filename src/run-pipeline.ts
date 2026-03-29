import "dotenv/config";

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  MODELS_PATH,
  OPENROUTER_DIR,
  OUTPUT_DIR,
  OUTPUT_IMAGE_PATH,
  OUTPUT_LOG_PATH,
  OUTPUT_TEXT_PATH,
  PROMPT_PATH,
  PROMPTS_DIR,
  REFERENCE_IMAGE_PATH,
  TEST_MODEL
} from "./config.js";
import { generateImageFromReference } from "./TerrainTemplateGenerate.js";
import {
  buildRunSummary,
  extractAssistantText,
  extractGeneratedImageDataUrl,
  fetchGenerationStats,
  fetchImageGenerationModels
} from "./openrouter.js";

function parseJsonText(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ensureApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing from .env");
  }

  return apiKey;
}

async function ensureDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function ensureProjectFolders(): Promise<void> {
  await Promise.all([
    fs.mkdir(OPENROUTER_DIR, { recursive: true }),
    fs.mkdir(OUTPUT_DIR, { recursive: true }),
    fs.mkdir(PROMPTS_DIR, { recursive: true })
  ]);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDirectory(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonArrayFile(filePath: string): Promise<unknown[]> {
  try {
    const fileContents = await fs.readFile(filePath, "utf8");
    const parsed = parseJsonText(fileContents);

    return isUnknownArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:(?<mime>[^;]+);base64,(?<payload>.+)$/);

  if (!match?.groups?.payload) {
    throw new Error("OpenRouter returned an invalid image data URL.");
  }

  return Buffer.from(match.groups.payload, "base64");
}

async function loadPrompt(): Promise<string> {
  const prompt = await fs.readFile(PROMPT_PATH, "utf8");
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new Error(`Prompt file is empty: ${PROMPT_PATH}`);
  }

  return trimmedPrompt;
}

async function refreshModelsFile(): Promise<void> {
  const modelsResponse = await fetchImageGenerationModels();
  await writeJsonFile(MODELS_PATH, modelsResponse);
}

async function appendRunLog(entry: unknown): Promise<void> {
  const existingEntries = await readJsonArrayFile(OUTPUT_LOG_PATH);
  existingEntries.push(entry);
  await writeJsonFile(OUTPUT_LOG_PATH, existingEntries);
}

async function runPipeline(): Promise<void> {
  const apiKey = ensureApiKey();

  await ensureProjectFolders();
  await refreshModelsFile();

  const prompt = await loadPrompt();
  const completion = await generateImageFromReference({
    apiKey,
    model: TEST_MODEL,
    prompt
  });
  const assistantText = extractAssistantText(completion);
  const generatedImageDataUrl = extractGeneratedImageDataUrl(completion);
  const generatedImageBuffer = decodeDataUrl(generatedImageDataUrl);

  await fs.writeFile(OUTPUT_IMAGE_PATH, generatedImageBuffer);
  await fs.writeFile(
    OUTPUT_TEXT_PATH,
    assistantText.length > 0 ? `${assistantText}\n` : "No text prompt returned.\n",
    "utf8"
  );

  let generationStats: unknown = null;

  if (completion.id) {
    try {
      generationStats = await fetchGenerationStats(apiKey, completion.id);
    } catch (error) {
      generationStats = {
        error:
          error instanceof Error ? error.message : "Failed to load generation stats."
      };
    }
  }

  await appendRunLog(
    buildRunSummary({
      assistantText,
      completion,
      generationStats,
      modelRequested: TEST_MODEL,
      modelsPath: MODELS_PATH,
      outputImagePath: OUTPUT_IMAGE_PATH,
      outputTextPath: OUTPUT_TEXT_PATH,
      prompt,
      promptFile: PROMPT_PATH,
      referenceImagePath: REFERENCE_IMAGE_PATH
    })
  );

  console.log(`Reference image saved to ${REFERENCE_IMAGE_PATH}`);
  console.log(`Models reference saved to ${MODELS_PATH}`);
  console.log(`Generated image saved to ${OUTPUT_IMAGE_PATH}`);
  console.log(`Generated prompt text saved to ${OUTPUT_TEXT_PATH}`);
  console.log(`Run log updated at ${OUTPUT_LOG_PATH}`);
  console.log(`Model used: ${TEST_MODEL}`);
}

async function main(): Promise<void> {
  await ensureProjectFolders();

  try {
    if (process.argv.includes("--models-only")) {
      await refreshModelsFile();
      console.log(`Models reference saved to ${MODELS_PATH}`);
      return;
    }

    await runPipeline();
  } catch (error) {
    await appendRunLog({
      errorMessage: normalizeErrorMessage(error),
      failedAt: new Date().toISOString(),
      modelRequested: TEST_MODEL,
      modelsPath: MODELS_PATH,
      outputImagePath: OUTPUT_IMAGE_PATH,
      outputTextPath: OUTPUT_TEXT_PATH,
      promptFile: PROMPT_PATH,
      referenceImagePath: REFERENCE_IMAGE_PATH,
      status: "failed"
    });

    console.error(normalizeErrorMessage(error));
    process.exitCode = 1;
  }
}

void main();
