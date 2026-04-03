import "dotenv/config";

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { Jimp } from "jimp";

import {
  downloadFalImageAsBuffer,
  extractFalAssistantText,
  extractFalGeneratedImageUrl,
  isFalModelQuery,
  normalizeFalModelId,
  sendFalImageGenerationRequest
} from "./fal.js";
import {
  MODELS_PATH,
  OUTPUT_DIR,
  OUTPUT_LOG_PATH,
  PROJECT_ROOT,
  PROMPTS_DIR
} from "./config.js";
import {
  extractAssistantText,
  extractGeneratedImageDataUrl,
  fetchGenerationStats,
  sendOpenRouterImageGenerationRequest
} from "./openrouter.js";

type JsonObject = Record<string, unknown>;

interface ModelIndexEntry {
  architecture?: {
    output_modalities?: unknown;
  };
  canonical_slug?: string;
  id?: string;
}

interface OpenRouterResolvedModel {
  id: string;
  modalities: string[];
  provider: "openrouter";
}

interface FalResolvedModel {
  id: string;
  provider: "fal";
}

type ResolvedModel = OpenRouterResolvedModel | FalResolvedModel;

interface ParsedArgs {
  modelQuery: string;
  prefix: string;
  promptArg: string;
}

const TILE_OUTPUT_SIZE = 128;
const EXAMPLE_TILE_COUNT = 10;
const EXTRACT_START_X = 128;
const EXTRACT_START_Y = 128;

function parseJsonText(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ensureOpenRouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing from .env");
  }

  return apiKey;
}

function ensureFalApiKey(): string {
  const apiKey = process.env.FAL_KEY;

  if (!apiKey) {
    throw new Error("FAL_KEY is missing from .env");
  }

  return apiKey;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let modelQuery = "";
  let prefix = "";
  let promptArg = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg.startsWith("--model=")) {
      modelQuery = arg.slice("--model=".length);
      continue;
    }

    if (arg === "--model") {
      modelQuery = args[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--prompt=")) {
      promptArg = arg.slice("--prompt=".length);
      continue;
    }

    if (arg === "--prompt") {
      promptArg = args[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--prefix=")) {
      prefix = arg.slice("--prefix=".length);
      continue;
    }

    if (arg === "--prefix") {
      prefix = args[index + 1] ?? "";
      index += 1;
    }
  }

  if (!modelQuery || !promptArg || !prefix) {
    throw new Error(
      "Usage: tsx src/genImage.ts --model <model query> --prompt <prompt file> --prefix <output prefix>"
    );
  }

  return {
    modelQuery,
    prefix,
    promptArg
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePathWithDefaultExtension(input: {
  arg: string;
  baseDirectory: string;
  defaultExtension: string;
  explicitPrefix: string;
  label: string;
}): Promise<string> {
  const candidates: string[] = [];
  const hasExtension = path.extname(input.arg).length > 0;

  const addCandidate = (candidate: string): void => {
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  if (path.isAbsolute(input.arg)) {
    addCandidate(input.arg);

    if (!hasExtension) {
      addCandidate(`${input.arg}${input.defaultExtension}`);
    }
  } else if (input.arg.startsWith(`${input.explicitPrefix}/`)) {
    const projectRelativePath = path.join(PROJECT_ROOT, input.arg);
    addCandidate(projectRelativePath);

    if (!hasExtension) {
      addCandidate(`${projectRelativePath}${input.defaultExtension}`);
    }
  } else {
    const basePath = path.join(input.baseDirectory, input.arg);
    addCandidate(basePath);

    if (!hasExtension) {
      addCandidate(`${basePath}${input.defaultExtension}`);
    }
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `${input.label} file not found for "${input.arg}". Tried: ${candidates.join(", ")}`
  );
}

async function resolvePromptFilePath(promptArg: string): Promise<string> {
  return await resolvePathWithDefaultExtension({
    arg: promptArg,
    baseDirectory: PROMPTS_DIR,
    defaultExtension: ".md",
    explicitPrefix: "prompts",
    label: "Prompt"
  });
}

function sanitizeFileSlug(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}

function modelIdToOutputSegment(modelId: string): string {
  const segments = modelId.split("/").filter((segment) => segment.length > 0);
  const modelSegments = segments.length > 1 ? segments.slice(1) : segments;
  const sanitizedTailSegment = sanitizeFileSlug(modelSegments.join("-"));

  if (!sanitizedTailSegment) {
    throw new Error(`Could not build a safe output folder name from model id "${modelId}".`);
  }

  return sanitizedTailSegment;
}

function promptFilePathToOutputSegment(promptFilePath: string): string {
  const promptBaseName = path.basename(promptFilePath, path.extname(promptFilePath));
  const sanitizedPromptBaseName = sanitizeFileSlug(promptBaseName);

  if (!sanitizedPromptBaseName) {
    throw new Error(
      `Could not build a safe output folder name from prompt file "${promptFilePath}".`
    );
  }

  return sanitizedPromptBaseName;
}

function generateRandomHexSuffix(): string {
  return randomBytes(2).toString("hex");
}

async function allocateGeneratedImageBaseName(input: {
  modelSegment: string;
  outputDirectory: string;
  promptSegment: string;
}): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = `${input.promptSegment}-${input.modelSegment}-${generateRandomHexSuffix()}`;
    const candidateImagePath = path.join(input.outputDirectory, `${candidate}.png`);

    if (!(await pathExists(candidateImagePath))) {
      return candidate;
    }
  }

  throw new Error(
    `Could not allocate a unique generated image filename in ${input.outputDirectory}.`
  );
}

function normalizeOutputPrefix(prefix: string): string {
  const trimmedPrefix = prefix.trim();

  if (!trimmedPrefix) {
    throw new Error("Output prefix cannot be empty.");
  }

  if (path.isAbsolute(trimmedPrefix)) {
    throw new Error("Output prefix must be a relative path inside output/.");
  }

  const rawSegments = trimmedPrefix.split(/[\\/]+/gu).filter((segment) => segment.length > 0);

  if (rawSegments.length === 0) {
    throw new Error(`Output prefix "${prefix}" does not contain any usable path segments.`);
  }

  const normalizedSegments = rawSegments.map((segment) => {
    if (segment === "." || segment === "..") {
      throw new Error("Output prefix cannot contain . or .. path segments.");
    }

    const normalizedSegment = segment.replace(/[^\w.-]+/gu, "_");

    if (!normalizedSegment || normalizedSegment === "." || normalizedSegment === "..") {
      throw new Error(
        `Output prefix segment "${segment}" does not contain any usable characters.`
      );
    }

    return normalizedSegment;
  });

  return path.join(...normalizedSegments);
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:(?<mime>[^;]+);base64,(?<payload>.+)$/u);

  if (!match?.groups?.payload) {
    throw new Error("OpenRouter returned an invalid image data URL.");
  }

  return Buffer.from(match.groups.payload, "base64");
}

async function ensureDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
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

async function appendRunLog(entry: unknown): Promise<void> {
  const existingEntries = await readJsonArrayFile(OUTPUT_LOG_PATH);
  existingEntries.push(entry);
  await ensureDirectory(OUTPUT_LOG_PATH);
  await fs.writeFile(OUTPUT_LOG_PATH, `${JSON.stringify(existingEntries, null, 2)}\n`, "utf8");
}

function toModelEntries(data: unknown): ModelIndexEntry[] {
  if (!isRecord(data)) {
    throw new Error(`Invalid models index format in ${MODELS_PATH}`);
  }

  const models = data.data;

  if (!isUnknownArray(models)) {
    throw new Error(`Invalid models index format in ${MODELS_PATH}`);
  }

  return models.filter(isRecord);
}

function resolveOutputModalities(entry: ModelIndexEntry): string[] {
  const outputModalities = entry.architecture?.output_modalities;

  if (!isUnknownArray(outputModalities)) {
    return ["image", "text"];
  }

  const normalizedModalities = outputModalities.filter(
    (value): value is string => typeof value === "string"
  );

  if (!normalizedModalities.includes("image")) {
    return ["image", "text"];
  }

  return normalizedModalities.includes("text") ? ["image", "text"] : ["image"];
}

function buildModelRegex(modelQuery: string): RegExp {
  try {
    return new RegExp(modelQuery, "i");
  } catch (error) {
    throw new Error(
      `Invalid model regex "${modelQuery}": ${normalizeErrorMessage(error)}`,
      {
        cause: error
      }
    );
  }
}

async function resolveModels(modelQuery: string): Promise<ResolvedModel[]> {
  if (isFalModelQuery(modelQuery)) {
    return [
      {
        id: normalizeFalModelId(modelQuery),
        provider: "fal"
      }
    ];
  }

  const fileContents = await fs.readFile(MODELS_PATH, "utf8");
  const parsed = parseJsonText(fileContents);
  const modelEntries = toModelEntries(parsed);
  const modelRegex = buildModelRegex(modelQuery);
  const matches: ResolvedModel[] = [];
  const seen = new Set<string>();

  for (const entry of modelEntries) {
    const id = entry.id;
    const canonicalSlug = entry.canonical_slug;
    const didMatch =
      (typeof id === "string" && modelRegex.test(id)) ||
      (typeof canonicalSlug === "string" && modelRegex.test(canonicalSlug));

    if (!didMatch || typeof id !== "string" || seen.has(id)) {
      continue;
    }

    seen.add(id);
    matches.push({
      id,
      modalities: resolveOutputModalities(entry),
      provider: "openrouter"
    });
  }

  if (matches.length === 0) {
    throw new Error(`No model regex matches found for "${modelQuery}" in ${MODELS_PATH}`);
  }

  return matches;
}

async function loadPrompt(promptFilePath: string): Promise<string> {
  const prompt = await fs.readFile(promptFilePath, "utf8");
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new Error(`Prompt file is empty: ${promptFilePath}`);
  }

  return trimmedPrompt;
}

function extractKnownCost(input: {
  generationStats: unknown;
  usage: unknown;
}): number | null {
  const usage = input.usage;

  if (isRecord(usage) && typeof usage.cost === "number") {
    return usage.cost;
  }

  const generationStats = input.generationStats;

  if (isRecord(generationStats) && typeof generationStats.cost === "number") {
    return generationStats.cost;
  }

  return null;
}

function toIsoStrings(date: Date): {
  generatedAt: string;
  localDate: string;
  localTime: string;
} {
  return {
    generatedAt: date.toISOString(),
    localDate: date.toLocaleDateString("en-US"),
    localTime: date.toLocaleTimeString("en-US", {
      hour12: false
    })
  };
}

function buildDetails(input: {
  assistantText: string;
  example2ImagePath: string;
  executionTimeMs: number;
  exampleImagePath: string;
  extractImagePath: string;
  generatedAt: Date;
  generationStats: unknown;
  modelRequested: string;
  modelReturned: string;
  outputDirectory: string;
  output128ImagePath: string;
  outputImagePath: string;
  outputTextPath: string | null;
  prompt: string;
  promptFilePath: string;
  provider: "fal" | "openrouter";
  requestId: string | null;
  usage: unknown;
}): JsonObject {
  const { generatedAt, localDate, localTime } = toIsoStrings(input.generatedAt);
  const cost = extractKnownCost({
    generationStats: input.generationStats,
    usage: input.usage
  });

  return {
    assistantText: input.assistantText,
    cost,
    example2ImagePath: input.example2ImagePath,
    executionTimeMs: input.executionTimeMs,
    executionTimeSeconds: Number((input.executionTimeMs / 1000).toFixed(3)),
    exampleImagePath: input.exampleImagePath,
    extractImagePath: input.extractImagePath,
    generatedAt,
    localDate,
    localTime,
    generationStats: input.generationStats,
    modelRequested: input.modelRequested,
    modelReturned: input.modelReturned,
    outputDirectory: input.outputDirectory,
    output128ImagePath: input.output128ImagePath,
    outputImagePath: input.outputImagePath,
    outputTextPath: input.outputTextPath,
    promptFile: input.promptFilePath,
    promptLength: input.prompt.length,
    promptPreview: input.prompt.slice(0, 240),
    provider: input.provider,
    requestId: input.requestId,
    status: "success",
    usage: input.usage
  };
}

async function writeDerivedTileImages(input: {
  example2ImagePath: string;
  exampleImagePath: string;
  extractImagePath: string;
  output128ImagePath: string;
  outputImagePath: string;
}): Promise<void> {
  const sourceImage = await Jimp.read(input.outputImagePath);
  const tileImage = sourceImage.clone().resize({
    h: TILE_OUTPUT_SIZE,
    w: TILE_OUTPUT_SIZE
  });
  const exampleImage = new Jimp({
    color: 0x000000ff,
    height: TILE_OUTPUT_SIZE * EXAMPLE_TILE_COUNT,
    width: TILE_OUTPUT_SIZE * EXAMPLE_TILE_COUNT
  });
  const extractImage = sourceImage.clone().crop({
    h: TILE_OUTPUT_SIZE,
    w: TILE_OUTPUT_SIZE,
    x: EXTRACT_START_X,
    y: EXTRACT_START_Y
  });
  const example2Image = new Jimp({
    color: 0x000000ff,
    height: TILE_OUTPUT_SIZE * EXAMPLE_TILE_COUNT,
    width: TILE_OUTPUT_SIZE * EXAMPLE_TILE_COUNT
  });

  for (let y = 0; y < EXAMPLE_TILE_COUNT; y += 1) {
    for (let x = 0; x < EXAMPLE_TILE_COUNT; x += 1) {
      exampleImage.composite(tileImage, x * TILE_OUTPUT_SIZE, y * TILE_OUTPUT_SIZE);
      example2Image.composite(extractImage, x * TILE_OUTPUT_SIZE, y * TILE_OUTPUT_SIZE);
    }
  }

  await fs.writeFile(input.output128ImagePath, await tileImage.getBuffer("image/png"));
  await fs.writeFile(input.exampleImagePath, await exampleImage.getBuffer("image/png"));
  await fs.writeFile(input.extractImagePath, await extractImage.getBuffer("image/png"));
  await fs.writeFile(input.example2ImagePath, await example2Image.getBuffer("image/png"));
}

async function main(): Promise<void> {
  const { modelQuery, prefix, promptArg } = parseArgs();
  const promptFilePath = await resolvePromptFilePath(promptArg);
  const prompt = await loadPrompt(promptFilePath);
  const normalizedPrefix = normalizeOutputPrefix(prefix);
  const promptOutputSegment = promptFilePathToOutputSegment(promptFilePath);
  const resolvedModels = await resolveModels(modelQuery);
  const baseOutputDirectory = path.join(OUTPUT_DIR, normalizedPrefix);
  const generatedImagesDirectory = path.join(OUTPUT_DIR, "gen");
  let failureCount = 0;

  console.log(`Prompt file: ${promptFilePath}`);
  console.log(`Model query: ${modelQuery}`);
  console.log(`Output prefix: ${normalizedPrefix}`);
  console.log(
    `Matched models (${resolvedModels.length}): ${resolvedModels.map((model) => model.id).join(", ")}`
  );

  for (const resolvedModel of resolvedModels) {
    const modelOutputSegment = modelIdToOutputSegment(resolvedModel.id);
    const outputDirectory = path.join(
      baseOutputDirectory,
      modelOutputSegment,
      promptOutputSegment
    );
    const generatedImageBaseName = await allocateGeneratedImageBaseName({
      modelSegment: modelOutputSegment,
      outputDirectory: generatedImagesDirectory,
      promptSegment: promptOutputSegment
    });
    const outputImagePath = path.join(
      generatedImagesDirectory,
      `${generatedImageBaseName}.png`
    );
    const output128ImagePath = path.join(
      generatedImagesDirectory,
      `${generatedImageBaseName}-128.png`
    );
    const exampleImagePath = path.join(outputDirectory, "example.png");
    const extractImagePath = path.join(outputDirectory, "extract.png");
    const example2ImagePath = path.join(outputDirectory, "example2.png");
    const outputPromptPath = path.join(outputDirectory, "prompt.md");
    const outputDetailsPath = path.join(outputDirectory, "details.json");
    const outputTextPath = path.join(outputDirectory, "output.txt");

    try {
      const startedAt = Date.now();
      let assistantText = "";
      let generatedImageBuffer: Buffer;
      let generationStats: unknown = null;
      let modelReturned = resolvedModel.id;
      let requestId: string | null = null;
      let usage: unknown = null;

      if (resolvedModel.provider === "fal") {
        const falApiKey = ensureFalApiKey();
        const generation = await sendFalImageGenerationRequest({
          apiKey: falApiKey,
          imageHeight: 1024,
          imageWidth: 1024,
          model: resolvedModel.id,
          prompt
        });

        assistantText = extractFalAssistantText(generation);
        generatedImageBuffer = await downloadFalImageAsBuffer(
          extractFalGeneratedImageUrl(generation)
        );
        generationStats = {
          has_nsfw_concepts: generation.data.has_nsfw_concepts ?? null,
          requestId: generation.requestId,
          seed: generation.data.seed ?? null,
          timings: generation.data.timings ?? null
        };
        requestId = generation.requestId;
      } else {
        const openRouterApiKey = ensureOpenRouterApiKey();
        const completion = await sendOpenRouterImageGenerationRequest({
          apiKey: openRouterApiKey,
          imageConfig: {
            aspect_ratio: "1:1",
            image_size: "1K"
          },
          messages: [
            {
              content: [
                {
                  text: prompt,
                  type: "text"
                }
              ],
              role: "user"
            }
          ],
          model: resolvedModel.id,
          modalities: resolvedModel.modalities
        });

        assistantText = extractAssistantText(completion);
        generatedImageBuffer = decodeDataUrl(
          extractGeneratedImageDataUrl(completion)
        );
        modelReturned = completion.model ?? resolvedModel.id;
        requestId = completion.id ?? null;
        usage = completion.usage ?? null;

        if (completion.id) {
          try {
            generationStats = await fetchGenerationStats(openRouterApiKey, completion.id);
          } catch (error) {
            generationStats = {
              error: normalizeErrorMessage(error)
            };
          }
        }
      }

      await fs.mkdir(outputDirectory, { recursive: true });
      await fs.mkdir(generatedImagesDirectory, { recursive: true });
      await fs.writeFile(outputImagePath, generatedImageBuffer);
      await writeDerivedTileImages({
        example2ImagePath,
        exampleImagePath,
        extractImagePath,
        output128ImagePath,
        outputImagePath
      });

      await fs.writeFile(outputPromptPath, `${prompt}\n`, "utf8");
      const details = buildDetails({
        assistantText,
        example2ImagePath,
        exampleImagePath,
        executionTimeMs: Date.now() - startedAt,
        extractImagePath,
        generatedAt: new Date(),
        generationStats,
        modelRequested: resolvedModel.id,
        modelReturned,
        output128ImagePath,
        outputDirectory,
        outputImagePath,
        outputTextPath: assistantText ? outputTextPath : null,
        prompt,
        promptFilePath,
        provider: resolvedModel.provider,
        requestId,
        usage,
      });
      await fs.writeFile(outputDetailsPath, `${JSON.stringify(details, null, 2)}\n`, "utf8");

      if (assistantText) {
        await fs.writeFile(outputTextPath, `${assistantText}\n`, "utf8");
      }

      await appendRunLog(details);

      console.log(`Completed model: ${resolvedModel.id}`);
      console.log(`Provider: ${resolvedModel.provider}`);
      console.log(`Output directory: ${outputDirectory}`);
      console.log(`Image saved to ${outputImagePath}`);
      console.log(`128x128 tile saved to ${output128ImagePath}`);
      console.log(`10x10 example saved to ${exampleImagePath}`);
      console.log(`Extracted tile saved to ${extractImagePath}`);
      console.log(`10x10 extract example saved to ${example2ImagePath}`);
      console.log(`Prompt saved to ${outputPromptPath}`);
      console.log(`Details saved to ${outputDetailsPath}`);

      if (assistantText) {
        console.log(`Text output saved to ${outputTextPath}`);
      }
    } catch (error) {
      failureCount += 1;

      await appendRunLog({
        errorMessage: normalizeErrorMessage(error),
        failedAt: new Date().toISOString(),
        modelRequested: resolvedModel.id,
        outputDirectory,
        outputImagePath,
        outputTextPath,
        prefix: normalizedPrefix,
        promptFile: promptFilePath,
        provider: resolvedModel.provider,
        status: "failed"
      });

      console.error(`Model failed: ${resolvedModel.id}`);
      console.error(normalizeErrorMessage(error));
    }
  }

  console.log(`Run log updated at ${OUTPUT_LOG_PATH}`);

  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

void main();
