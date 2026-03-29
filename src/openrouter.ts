import {
  MODELS_PATH,
  OPENROUTER_API_BASE_URL,
  OPENROUTER_APP_HEADERS,
  OUTPUT_IMAGE_PATH,
  OUTPUT_TEXT_PATH,
  PROMPT_PATH,
  REFERENCE_IMAGE_PATH,
  TEST_MODEL
} from "./config.js";

type JsonObject = Record<string, unknown>;
type RequestHeaders = Record<string, string>;

interface OpenRouterGeneratedImage {
  image_url?: {
    url?: string;
  };
}

interface OpenRouterMessage {
  content?: unknown;
  images?: OpenRouterGeneratedImage[];
}

interface OpenRouterChoice {
  finish_reason?: string | null;
  message?: OpenRouterMessage;
  native_finish_reason?: string | null;
}

export interface OpenRouterCompletionResponse extends JsonObject {
  choices?: OpenRouterChoice[];
  created?: number;
  id?: string;
  model?: string;
  usage?: JsonObject;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function buildHeaders(apiKey?: string): RequestHeaders {
  return {
    "Content-Type": "application/json",
    ...OPENROUTER_APP_HEADERS,
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const responseText = await response.text();

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

export function toCompletionResponse(data: unknown): OpenRouterCompletionResponse {
  if (!isRecord(data)) {
    throw new Error("OpenRouter returned a non-object completion response.");
  }

  return data as OpenRouterCompletionResponse;
}

export async function fetchImageGenerationModels(): Promise<unknown> {
  const response = await fetch(
    `${OPENROUTER_API_BASE_URL}/models?output_modalities=image`,
    {
      headers: buildHeaders(),
      method: "GET"
    }
  );

  if (!response.ok) {
    const errorBody = await readJsonResponse(response);
    throw new Error(
      `OpenRouter models request failed (${response.status}): ${JSON.stringify(errorBody)}`
    );
  }

  return await readJsonResponse(response);
}

export async function sendOpenRouterImageGenerationRequest(input: {
  apiKey: string;
  messages: unknown[];
  imageConfig?: JsonObject;
  modalities: string[];
  model: string;
}): Promise<OpenRouterCompletionResponse> {
  const response = await fetch(`${OPENROUTER_API_BASE_URL}/chat/completions`, {
    body: JSON.stringify({
      image_config: input.imageConfig,
      messages: input.messages,
      model: input.model,
      modalities: input.modalities,
      stream: false
    }),
    headers: buildHeaders(input.apiKey),
    method: "POST"
  });

  if (!response.ok) {
    const errorBody = await readJsonResponse(response);
    throw new Error(
      `OpenRouter image generation failed (${response.status}): ${JSON.stringify(errorBody)}`
    );
  }

  return toCompletionResponse(await readJsonResponse(response));
}

export async function fetchGenerationStats(
  apiKey: string,
  generationId: string
): Promise<unknown> {
  const url = new URL(`${OPENROUTER_API_BASE_URL}/generation`);
  url.searchParams.set("id", generationId);

  const response = await fetch(url, {
    headers: buildHeaders(apiKey),
    method: "GET"
  });

  if (!response.ok) {
    const errorBody = await readJsonResponse(response);
    throw new Error(
      `OpenRouter generation stats request failed (${response.status}): ${JSON.stringify(errorBody)}`
    );
  }

  return await readJsonResponse(response);
}

export function extractAssistantText(response: OpenRouterCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const textParts = content
    .filter(isRecord)
    .map((part) => {
      const text = part.text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text.length > 0);

  return textParts.join("\n").trim();
}

export function extractGeneratedImageDataUrl(
  response: OpenRouterCompletionResponse
): string {
  const imageDataUrl = response.choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!imageDataUrl) {
    throw new Error("OpenRouter returned no generated image data.");
  }

  return imageDataUrl;
}

export function buildRunSummary(input: {
  assistantText: string;
  completion: OpenRouterCompletionResponse;
  generationStats: unknown;
  modelRequested?: string;
  modelsPath?: string;
  outputImagePath?: string;
  outputTextPath?: string;
  prompt: string;
  promptFile?: string;
  referenceImagePath?: string;
}): JsonObject {
  return {
    assistantText: input.assistantText,
    completionId: input.completion.id ?? null,
    createdUnixSeconds: input.completion.created ?? null,
    finishReason: input.completion.choices?.[0]?.finish_reason ?? null,
    generatedAt: new Date().toISOString(),
    generationStats: input.generationStats,
    modelRequested: input.modelRequested ?? TEST_MODEL,
    modelReturned: input.completion.model ?? input.modelRequested ?? TEST_MODEL,
    modelsPath: input.modelsPath ?? MODELS_PATH,
    nativeFinishReason:
      input.completion.choices?.[0]?.native_finish_reason ?? null,
    outputImagePath: input.outputImagePath ?? OUTPUT_IMAGE_PATH,
    outputTextPath: input.outputTextPath ?? OUTPUT_TEXT_PATH,
    promptFile: input.promptFile ?? PROMPT_PATH,
    promptLength: input.prompt.length,
    promptPreview: input.prompt.slice(0, 240),
    referenceImagePath: input.referenceImagePath ?? REFERENCE_IMAGE_PATH,
    status: "success",
    usage: input.completion.usage ?? null
  };
}
