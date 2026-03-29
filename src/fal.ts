import { fal, type QueueStatus } from "@fal-ai/client";

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

export interface FalGenerationResponse extends JsonObject {
  data: FalGenerationData;
  requestId: string;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:(?<mime>[^;]+);base64,(?<payload>.+)$/u);

  if (!match?.groups?.payload) {
    throw new Error("Fal returned an invalid image data URL.");
  }

  return Buffer.from(match.groups.payload, "base64");
}

export function isFalModelQuery(modelQuery: string): boolean {
  const normalizedModelQuery = modelQuery.trim().toLowerCase();

  return (
    normalizedModelQuery.startsWith("fal/") ||
    normalizedModelQuery.startsWith("fal-ai/")
  );
}

export function normalizeFalModelId(modelQuery: string): string {
  const trimmedModelQuery = modelQuery.trim();
  const normalizedModelQuery = trimmedModelQuery.toLowerCase();

  if (normalizedModelQuery.startsWith("fal-ai/")) {
    return trimmedModelQuery;
  }

  if (normalizedModelQuery.startsWith("fal/")) {
    return `fal-ai/${trimmedModelQuery.slice("fal/".length)}`;
  }

  throw new Error(
    `Fal model ids must start with "fal/" or "fal-ai/". Received "${modelQuery}".`
  );
}

export async function sendFalImageEditRequest(input: {
  apiKey: string;
  imageDataUrl: string;
  imageHeight: number;
  imageWidth: number;
  model: string;
  prompt: string;
}): Promise<FalGenerationResponse> {
  fal.config({
    credentials: input.apiKey
  });

  const result = await fal.subscribe(input.model, {
    input: {
      image_size: {
        height: input.imageHeight,
        width: input.imageWidth
      },
      image_urls: [input.imageDataUrl],
      num_images: 1,
      output_format: "png",
      prompt: input.prompt
    },
    logs: true,
    onQueueUpdate: (update: QueueStatus) => {
      if (update.status !== "IN_PROGRESS") {
        return;
      }

      update.logs.forEach((log) => {
        console.log(`[fal:${input.model}] ${log.message}`);
      });
    }
  });

  return {
    data: isRecord(result.data) ? (result.data as FalGenerationData) : {},
    requestId: result.requestId
  };
}

export async function sendFalImageGenerationRequest(input: {
  apiKey: string;
  imageHeight: number;
  imageWidth: number;
  model: string;
  prompt: string;
}): Promise<FalGenerationResponse> {
  fal.config({
    credentials: input.apiKey
  });

  const result = await fal.subscribe(input.model, {
    input: {
      image_size: {
        height: input.imageHeight,
        width: input.imageWidth
      },
      num_images: 1,
      output_format: "png",
      prompt: input.prompt
    },
    logs: true,
    onQueueUpdate: (update: QueueStatus) => {
      if (update.status !== "IN_PROGRESS") {
        return;
      }

      update.logs.forEach((log) => {
        console.log(`[fal:${input.model}] ${log.message}`);
      });
    }
  });

  return {
    data: isRecord(result.data) ? (result.data as FalGenerationData) : {},
    requestId: result.requestId
  };
}

export function extractFalAssistantText(response: FalGenerationResponse): string {
  return typeof response.data.prompt === "string" ? response.data.prompt.trim() : "";
}

export function extractFalGeneratedImageUrl(response: FalGenerationResponse): string {
  const imageUrl = response.data.images?.[0]?.url;

  if (!imageUrl) {
    throw new Error("Fal returned no generated image URL.");
  }

  return imageUrl;
}

export async function downloadFalImageAsBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    return decodeDataUrl(imageUrl);
  }

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to download Fal image (${response.status}) from ${imageUrl}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function buildFalRunSummary(input: {
  generation: FalGenerationResponse;
  modelRequested: string;
  outputImagePath: string;
  outputTextPath: string;
  prompt: string;
  promptFile: string;
  referenceImagePath: string;
}): JsonObject {
  return {
    completionId: input.generation.requestId,
    createdUnixSeconds: null,
    falData: input.generation.data,
    falRequestId: input.generation.requestId,
    finishReason: null,
    generatedAt: new Date().toISOString(),
    generationStats: {
      has_nsfw_concepts: input.generation.data.has_nsfw_concepts ?? null,
      requestId: input.generation.requestId,
      seed: input.generation.data.seed ?? null,
      timings: input.generation.data.timings ?? null
    },
    modelRequested: input.modelRequested,
    modelReturned: input.modelRequested,
    nativeFinishReason: null,
    outputImagePath: input.outputImagePath,
    outputTextPath: input.outputTextPath,
    promptFile: input.promptFile,
    promptLength: input.prompt.length,
    promptPreview: input.prompt.slice(0, 240),
    provider: "fal",
    referenceImagePath: input.referenceImagePath,
    status: "success",
    usage: null
  };
}
