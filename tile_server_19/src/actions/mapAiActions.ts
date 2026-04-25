"use server";

import { randomInt } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { fal, type QueueStatus } from "@fal-ai/client";

import {
  getMapAiModelConfig,
  sanitizeMapAiSlug,
  type MapAiModelRunResult,
  type MapAiPreparedRun,
  type MapAiSelectionSummary
} from "../lib/mapAi";

dotenv.config({
  path: path.resolve(process.cwd(), "../.env")
});

type JsonObject = Record<string, unknown>;

interface FalGeneratedImage extends JsonObject {
  content_type?: string;
  url?: string;
}

interface FalGenerationData extends JsonObject {
  has_nsfw_concepts?: unknown;
  images?: FalGeneratedImage[];
  prompt?: string;
  seed?: number;
  timings?: unknown;
}

interface FalGenerationResponse extends JsonObject {
  data: FalGenerationData;
  requestId: string;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function normalizeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(?<mime>[^;]+);base64,(?<payload>.+)$/u);

  if (!match?.groups?.payload) {
    throw new Error("Expected a PNG data URL.");
  }

  return Buffer.from(match.groups.payload, "base64");
}

async function ensureDirectory(directoryPath: string) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function writeJson(filePath: string, value: unknown) {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath: string, value: string) {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, value, "utf8");
}

function ensureFalApiKey() {
  const apiKey = process.env.FAL_KEY?.trim();

  if (!apiKey) {
    throw new Error("FAL_KEY is missing from ../.env");
  }

  return apiKey;
}

async function createUniqueRunDirectory(baseName: string) {
  const outputRoot = path.resolve(process.cwd(), "../output/tile_map_ai");

  await ensureDirectory(outputRoot);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidateName = `${baseName}-${randomInt(10, 10000)}`;
    const candidatePath = path.join(outputRoot, candidateName);

    try {
      await fs.mkdir(candidatePath);
      return {
        outputRoot,
        runDirectoryName: candidateName,
        runDirectoryPath: candidatePath
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Could not allocate a unique output directory for this AI run.");
}

function extractFalGeneratedImageUrl(response: FalGenerationResponse) {
  const imageUrl = response.data.images?.[0]?.url;

  if (!imageUrl) {
    throw new Error("Fal returned no generated image URL.");
  }

  return imageUrl;
}

async function downloadFalImageAsBuffer(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    return decodeDataUrl(imageUrl);
  }

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to download Fal image (${response.status}) from ${imageUrl}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function getEstimatedModelCostUsd(model: ReturnType<typeof getMapAiModelConfig>) {
  if (!model) {
    return 0;
  }

  if (model.costEstimateType === "per_image") {
    return model.costEstimateUsd;
  }

  return Math.round(model.costEstimateUsd * (1024 * 1024 / 1_000_000) * 100000) / 100000;
}

export async function prepareMapAiRunAction(input: {
  imageDataUrl: string;
  mapName: string;
  mapSlug: string;
  maskDataUrl: string;
  negativePrompt: string;
  prompt: string;
  selection: MapAiSelectionSummary | null;
}): Promise<MapAiPreparedRun> {
  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error("Description is required before submitting the AI edit.");
  }

  if (!input.imageDataUrl.startsWith("data:image/") || !input.maskDataUrl.startsWith("data:image/")) {
    throw new Error("AI Edit Prep is missing the image or edit mask preview.");
  }

  const runDirectory = await createUniqueRunDirectory(
    sanitizeMapAiSlug(input.mapSlug || input.mapName || "map")
  );
  const inputImagePath = path.join(runDirectory.runDirectoryPath, "input-image.png");
  const inputMaskPath = path.join(runDirectory.runDirectoryPath, "input-mask.png");

  await fs.writeFile(inputImagePath, decodeDataUrl(input.imageDataUrl));
  await fs.writeFile(inputMaskPath, decodeDataUrl(input.maskDataUrl));
  await writeText(path.join(runDirectory.runDirectoryPath, "prompt.txt"), `${prompt}\n`);
  await writeText(
    path.join(runDirectory.runDirectoryPath, "negative-prompt.txt"),
    `${input.negativePrompt.trim()}\n`
  );
  await writeJson(path.join(runDirectory.runDirectoryPath, "run.json"), {
    createdAt: new Date().toISOString(),
    mapName: input.mapName,
    mapSlug: input.mapSlug,
    negativePromptLength: input.negativePrompt.trim().length,
    promptLength: prompt.length,
    runDirectoryName: runDirectory.runDirectoryName,
    selection: input.selection
  });

  return {
    inputImagePath,
    inputMaskPath,
    outputRoot: runDirectory.outputRoot,
    runDirectoryName: runDirectory.runDirectoryName,
    runDirectoryPath: runDirectory.runDirectoryPath
  };
}

export async function runMapAiModelAction(input: {
  imageDataUrl: string;
  mapName: string;
  mapSlug: string;
  maskDataUrl: string;
  modelId: string;
  negativePrompt: string;
  prompt: string;
  runDirectoryName: string;
  selection: MapAiSelectionSummary | null;
}): Promise<MapAiModelRunResult> {
  const model = getMapAiModelConfig(input.modelId);

  if (!model) {
    throw new Error(`Unsupported AI model "${input.modelId}".`);
  }

  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error("Description is required before submitting the AI edit.");
  }

  const apiKey = ensureFalApiKey();
  const runDirectoryPath = path.resolve(process.cwd(), "../output/tile_map_ai", input.runDirectoryName);
  const modelDirectoryPath = path.join(runDirectoryPath, sanitizeMapAiSlug(model.id));
  const requestPath = path.join(modelDirectoryPath, "request.json");
  const responsePath = path.join(modelDirectoryPath, "response.json");
  const metadataPath = path.join(modelDirectoryPath, "metadata.json");
  const outputImagePath = path.join(modelDirectoryPath, "output.png");
  const logsPath = path.join(modelDirectoryPath, "logs.json");
  const negativePrompt = input.negativePrompt.trim();
  const requestInput: JsonObject = {
    image_size: {
      height: 1024,
      width: 1024
    },
    num_images: 1,
    prompt,
    [model.imageField]: input.imageDataUrl,
    [model.maskField]: input.maskDataUrl
  };

  if (model.outputFormatField) {
    requestInput[model.outputFormatField] = "png";
  }

  if (model.supportsNegativePrompt && negativePrompt) {
    requestInput.negative_prompt = negativePrompt;
  }

  await writeJson(requestPath, {
    mapName: input.mapName,
    mapSlug: input.mapSlug,
    model,
    prompt,
    requestInput,
    runDirectoryName: input.runDirectoryName,
    selection: input.selection,
    submittedAt: new Date().toISOString()
  });

  fal.config({
    credentials: apiKey
  });

  const logMessages: string[] = [];
  const startedAt = Date.now();

  try {
    const result = await fal.subscribe(model.id, {
      input: requestInput,
      logs: true,
      onQueueUpdate: (update: QueueStatus) => {
        if (update.status !== "IN_PROGRESS") {
          return;
        }

        update.logs.forEach((log) => {
          logMessages.push(log.message);
        });
      }
    });
    const normalizedResponse: FalGenerationResponse = {
      data: isRecord(result.data) ? (result.data as FalGenerationData) : {},
      requestId: result.requestId
    };
    const imageBuffer = await downloadFalImageAsBuffer(extractFalGeneratedImageUrl(normalizedResponse));
    const estimatedCostUsd = getEstimatedModelCostUsd(model);
    const durationMs = Date.now() - startedAt;

    await ensureDirectory(modelDirectoryPath);
    await fs.writeFile(outputImagePath, imageBuffer);
    await writeJson(responsePath, normalizedResponse);
    await writeJson(logsPath, logMessages);
    await writeJson(metadataPath, {
      completedAt: new Date().toISOString(),
      durationMs,
      estimatedCostUsd,
      hasNsfwConcepts: normalizedResponse.data.has_nsfw_concepts ?? null,
      imageUrl: normalizedResponse.data.images?.[0]?.url ?? null,
      modelId: model.id,
      modelLabel: model.label,
      negativePromptApplied: model.supportsNegativePrompt ? Boolean(negativePrompt) : false,
      outputImagePath,
      requestId: normalizedResponse.requestId,
      seed: normalizedResponse.data.seed ?? null,
      timings: normalizedResponse.data.timings ?? null,
      tokenUsage: null
    });

    return {
      durationMs,
      estimatedCostUsd,
      metadataPath,
      modelId: model.id,
      modelLabel: model.label,
      outputImagePath,
      requestId: normalizedResponse.requestId,
      responsePath
    };
  } catch (error) {
    await ensureDirectory(modelDirectoryPath);
    await writeJson(logsPath, logMessages);
    await writeJson(metadataPath, {
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      error: normalizeErrorMessage(error),
      modelId: model.id,
      modelLabel: model.label
    });
    throw error;
  }
}
