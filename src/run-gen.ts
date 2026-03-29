import "dotenv/config";

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  FAIL_ROOT,
  getLowestUnusedNumberedDirectory,
  KEEP_ROOT,
  moveFilesToDirectory
} from "./archive-output.js";
import {
  AUTO_KEEP_THRESHOLD,
  compareReferenceToGeneratedImage,
  writeBalancedImage,
  writeMixImage,
  writeErrorReport
} from "./compare-output.js";
import {
  buildFalRunSummary,
  downloadFalImageAsBuffer,
  extractFalAssistantText,
  extractFalGeneratedImageUrl,
  isFalModelQuery,
  normalizeFalModelId,
  sendFalImageEditRequest
} from "./fal.js";
import { generateKeepReport } from "./gen_keep_report.js";
import {
  MAPS_DIR,
  MODELS_PATH,
  OUTPUT_DIR,
  OUTPUT_LOG_PATH,
  PROJECT_ROOT,
  PROMPTS_DIR
} from "./config.js";
import {
  TILE_X,
  TILE_Y,
  encodeImageAsDataUrl,
  generateImageFromReference,
  parseTileGridFromMapFile,
  serializeTileGridAsText,
  writeTileGridImage
} from "./TerrainTemplateGenerate.js";
import {
  buildRunSummary,
  extractAssistantText,
  extractGeneratedImageDataUrl,
  fetchGenerationStats
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

function resolveRequiredArgs(): {
  drawTileLines: boolean;
  mapArg: string;
  modelQuery: string;
  promptArg: string;
} {
  const rawArgs = process.argv.slice(2);
  const positionalArgs: string[] = [];
  let drawTileLines = false;

  for (const arg of rawArgs) {
    if (arg === "--lines") {
      drawTileLines = true;
      continue;
    }

    positionalArgs.push(arg);
  }

  const [mapArg, modelQuery, promptArg] = positionalArgs;

  if (!mapArg || !modelQuery || !promptArg) {
    throw new Error(
      "Usage: npm run gen -- <map file> <model slug> <prompt file> [--lines]"
    );
  }

  return {
    drawTileLines,
    mapArg,
    modelQuery,
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
  defaultExtension: string;
  explicitPrefix: string;
  baseDirectory: string;
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

async function resolveMapFilePath(mapArg: string): Promise<string> {
  return await resolvePathWithDefaultExtension({
    arg: mapArg,
    baseDirectory: MAPS_DIR,
    defaultExtension: ".txt",
    explicitPrefix: "maps",
    label: "Map"
  });
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

async function main(): Promise<void> {
  const { drawTileLines, mapArg, modelQuery, promptArg } = resolveRequiredArgs();
  const mapFilePath = await resolveMapFilePath(mapArg);
  const promptFilePath = await resolvePromptFilePath(promptArg);
  const mapBaseName = path.basename(mapFilePath, path.extname(mapFilePath));
  const fallbackSlug = sanitizeFileSlug(modelQuery);

  try {
    const tileGrid = await parseTileGridFromMapFile(mapFilePath);
    const resolvedModels = await resolveModels(modelQuery);
    const prompt = await loadPrompt(promptFilePath);
    let failureCount = 0;

    console.log(`Map file: ${mapFilePath}`);
    console.log(`Model query: ${modelQuery}`);
    console.log(`Reference tile lines: ${drawTileLines ? "enabled" : "disabled"}`);
    console.log(
      `Matched models (${resolvedModels.length}): ${resolvedModels.map((model) => model.id).join(", ")}`
    );

    for (const resolvedModel of resolvedModels) {
      const modelSlug = resolvedModel.id;
      const outputSlug = sanitizeFileSlug(modelSlug);
      const outputImagePath = path.join(OUTPUT_DIR, `${mapBaseName}_${outputSlug}.png`);
      const outputTextPath = path.join(
        OUTPUT_DIR,
        `${mapBaseName}_${outputSlug}.prompt.txt`
      );
      const outputInPromptPath = path.join(
        OUTPUT_DIR,
        `${mapBaseName}_${outputSlug}.inprompt.md`
      );
      const outputMapPath = path.join(
        OUTPUT_DIR,
        `${mapBaseName}_${outputSlug}.map.txt`
      );
      const outputErrorPath = path.join(
        OUTPUT_DIR,
        `${mapBaseName}_${outputSlug}.error.json`
      );
      const outputMixPath = path.join(
        OUTPUT_DIR,
        `${mapBaseName}_${outputSlug}.mix.png`
      );
      const outputBalancedPath = path.join(
        OUTPUT_DIR,
        `${mapBaseName}_${outputSlug}.balanced.png`
      );
      const referenceImagePath = path.join(
        OUTPUT_DIR,
        `${mapBaseName}_${outputSlug}.reference.png`
      );

      try {
        let assistantText = "";
        let generatedImageBuffer: Buffer;
        let generationStats: unknown = null;
        let logEntryBase: JsonObject;

        if (resolvedModel.provider === "fal") {
          const falApiKey = ensureFalApiKey();

          await writeTileGridImage(tileGrid, referenceImagePath, {
            drawTileLines
          });

          const falGeneration = await sendFalImageEditRequest({
            apiKey: falApiKey,
            imageDataUrl: await encodeImageAsDataUrl(referenceImagePath),
            imageHeight: tileGrid.height * TILE_Y,
            imageWidth: tileGrid.width * TILE_X,
            model: modelSlug,
            prompt
          });

          assistantText = extractFalAssistantText(falGeneration);
          generatedImageBuffer = await downloadFalImageAsBuffer(
            extractFalGeneratedImageUrl(falGeneration)
          );
          generationStats = {
            has_nsfw_concepts: falGeneration.data.has_nsfw_concepts ?? null,
            requestId: falGeneration.requestId,
            seed: falGeneration.data.seed ?? null,
            timings: falGeneration.data.timings ?? null
          };
          logEntryBase = buildFalRunSummary({
            generation: falGeneration,
            modelRequested: modelSlug,
            outputImagePath,
            outputTextPath,
            prompt,
            promptFile: promptFilePath,
            referenceImagePath
          });
        } else {
          const openRouterApiKey = ensureOpenRouterApiKey();
          const completion = await generateImageFromReference({
            apiKey: openRouterApiKey,
            drawTileLines,
            model: modelSlug,
            modalities: resolvedModel.modalities,
            prompt,
            referenceImagePath,
            tileGrid
          });

          assistantText = extractAssistantText(completion);
          const generatedImageDataUrl = extractGeneratedImageDataUrl(completion);
          generatedImageBuffer = decodeDataUrl(generatedImageDataUrl);

          if (completion.id) {
            try {
              generationStats = await fetchGenerationStats(openRouterApiKey, completion.id);
            } catch (error) {
              generationStats = {
                error: normalizeErrorMessage(error)
              };
            }
          }

          logEntryBase = buildRunSummary({
            assistantText,
            completion,
            generationStats,
            modelRequested: modelSlug,
            modelsPath: MODELS_PATH,
            outputImagePath,
            outputTextPath,
            prompt,
            promptFile: promptFilePath,
            referenceImagePath
          });
        }

        await ensureDirectory(outputImagePath);
        await fs.writeFile(outputImagePath, generatedImageBuffer);
        await fs.writeFile(outputInPromptPath, `${prompt}\n`, "utf8");
        await fs.writeFile(outputMapPath, serializeTileGridAsText(tileGrid), "utf8");
        await fs.writeFile(
          outputTextPath,
          assistantText.length > 0 ? `${assistantText}\n` : "No text prompt returned.\n",
          "utf8"
        );
        await writeBalancedImage({
          balancedImagePath: outputBalancedPath,
          generatedImagePath: outputImagePath,
          referenceImagePath,
          tileGrid
        });
        await writeMixImage({
          generatedImagePath: outputImagePath,
          mixImagePath: outputMixPath,
          referenceImagePath,
          tileGrid
        });
        const comparison = await compareReferenceToGeneratedImage({
          generatedImagePath: outputImagePath,
          referenceImagePath,
          tileGrid
        });
        const archiveDecision = comparison.total_error <= AUTO_KEEP_THRESHOLD ? "keep" : "fail";

        await writeErrorReport(outputErrorPath, {
          ...comparison,
          decision: archiveDecision,
          threshold: AUTO_KEEP_THRESHOLD
        });

        const archiveRoot = archiveDecision === "keep" ? KEEP_ROOT : FAIL_ROOT;
        const archiveDirectory = await getLowestUnusedNumberedDirectory(archiveRoot);
        const movedPaths = await moveFilesToDirectory(
          [
            outputImagePath,
            outputBalancedPath,
            outputInPromptPath,
            outputMapPath,
            outputErrorPath,
            outputMixPath,
            outputTextPath,
            referenceImagePath
          ],
          archiveDirectory
        );
        const finalOutputImagePath =
          movedPaths.find(
            (filePath) =>
              filePath.endsWith(".png") &&
              !filePath.endsWith(".balanced.png") &&
              !filePath.endsWith(".mix.png") &&
              !filePath.endsWith(".reference.png")
          ) ??
          outputImagePath;
        const finalOutputTextPath =
          movedPaths.find((filePath) => filePath.endsWith(".prompt.txt")) ?? outputTextPath;
        const finalReferenceImagePath =
          movedPaths.find((filePath) => filePath.endsWith(".reference.png")) ??
          referenceImagePath;
        const finalOutputMapPath =
          movedPaths.find((filePath) => filePath.endsWith(".map.txt")) ?? outputMapPath;
        const finalOutputInPromptPath =
          movedPaths.find((filePath) => filePath.endsWith(".inprompt.md")) ?? outputInPromptPath;
        const finalOutputErrorPath =
          movedPaths.find((filePath) => filePath.endsWith(".error.json")) ?? outputErrorPath;
        const finalOutputMixPath =
          movedPaths.find((filePath) => filePath.endsWith(".mix.png")) ?? outputMixPath;
        const finalOutputBalancedPath =
          movedPaths.find((filePath) => filePath.endsWith(".balanced.png")) ?? outputBalancedPath;

        await appendRunLog(
          {
            ...logEntryBase,
            archive_decision: archiveDecision,
            archive_directory: archiveDirectory,
            compare_threshold: AUTO_KEEP_THRESHOLD,
            compare_total_error: comparison.total_error,
            outputImagePath: finalOutputImagePath,
            outputErrorPath: finalOutputErrorPath,
            outputBalancedPath: finalOutputBalancedPath,
            outputInPromptPath: finalOutputInPromptPath,
            outputMixPath: finalOutputMixPath,
            outputMapPath: finalOutputMapPath,
            outputTextPath: finalOutputTextPath,
            provider: resolvedModel.provider,
            referenceTileLines: drawTileLines,
            referenceImagePath: finalReferenceImagePath
          }
        );

        console.log(`Completed model: ${modelSlug}`);
        if (resolvedModel.provider === "openrouter") {
          console.log(`Provider: OpenRouter`);
          console.log(`Used modalities: ${resolvedModel.modalities.join(", ")}`);
        } else {
          console.log(`Provider: fal.ai`);
        }
        console.log(`Comparison total error: ${comparison.total_error}`);
        console.log(`Archive decision: ${archiveDecision}`);
        console.log(`Archived files to ${archiveDirectory}`);
        console.log(`Reference image saved to ${finalReferenceImagePath}`);
        console.log(`Generated image saved to ${finalOutputImagePath}`);
        console.log(`Balanced image saved to ${finalOutputBalancedPath}`);
        console.log(`Mix image saved to ${finalOutputMixPath}`);
        console.log(`Input prompt saved to ${finalOutputInPromptPath}`);
        console.log(`Generated map text saved to ${finalOutputMapPath}`);
        console.log(`Error report saved to ${finalOutputErrorPath}`);
        console.log(`Generated prompt text saved to ${finalOutputTextPath}`);
      } catch (error) {
        failureCount += 1;

        await appendRunLog({
          errorMessage: normalizeErrorMessage(error),
          failedAt: new Date().toISOString(),
          mapFilePath,
          referenceTileLines: drawTileLines,
          modelRequested: modelSlug,
          modelsPath: resolvedModel.provider === "openrouter" ? MODELS_PATH : null,
          outputImagePath,
          outputTextPath,
          provider: resolvedModel.provider,
          promptFile: promptFilePath,
          referenceImagePath,
          status: "failed"
        });

        console.error(`Model failed: ${modelSlug}`);
        console.error(normalizeErrorMessage(error));
      }
    }

    console.log(`Run log updated at ${OUTPUT_LOG_PATH}`);

    const keepReportResult = await generateKeepReport();
    console.log(`Keep report updated at ${keepReportResult.reportPath}`);
    console.log(`Keep report items: ${keepReportResult.itemCount}`);

    if (failureCount > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    const outputImagePath = path.join(OUTPUT_DIR, `${mapBaseName}_${fallbackSlug}.png`);
    const outputTextPath = path.join(
      OUTPUT_DIR,
      `${mapBaseName}_${fallbackSlug}.prompt.txt`
    );
    const referenceImagePath = path.join(
      OUTPUT_DIR,
      `${mapBaseName}_${fallbackSlug}.reference.png`
    );

    await appendRunLog({
      errorMessage: normalizeErrorMessage(error),
      failedAt: new Date().toISOString(),
      mapFilePath,
      referenceTileLines: drawTileLines,
      modelRequested: modelQuery,
      modelsPath: isFalModelQuery(modelQuery) ? null : MODELS_PATH,
      outputImagePath,
      outputTextPath,
      provider: isFalModelQuery(modelQuery) ? "fal" : "openrouter",
      promptFile: promptFilePath,
      referenceImagePath,
      status: "failed"
    });

    console.error(normalizeErrorMessage(error));
    process.exitCode = 1;
  }
}

void main();
