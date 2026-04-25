export interface MapAiModelConfig {
  costEstimateType: "per_image" | "per_megapixel";
  costEstimateUsd: number;
  id: string;
  imageField: "image_url";
  label: string;
  maskField: "mask_image_url" | "mask_url";
  outputFormatField: "format" | "output_format" | null;
  supportsNegativePrompt: boolean;
}

export interface MapAiSelectionSummary {
  pixelHeight: number;
  pixelWidth: number;
  tileHeight: number;
  tileWidth: number;
}

export interface MapAiPreparedRun {
  inputImagePath: string;
  inputMaskPath: string;
  outputRoot: string;
  runDirectoryName: string;
  runDirectoryPath: string;
}

export interface MapAiModelRunResult {
  durationMs: number;
  estimatedCostUsd: number;
  metadataPath: string;
  modelId: string;
  modelLabel: string;
  outputImagePath: string;
  requestId: string;
  responsePath: string;
}

export const MAP_AI_SUPPORTED_MODELS: MapAiModelConfig[] = [
  {
    costEstimateType: "per_megapixel",
    costEstimateUsd: 0,
    id: "fal-ai/playground-v25/inpainting",
    imageField: "image_url",
    label: "Playground v2.5 Inpainting",
    maskField: "mask_url",
    outputFormatField: "format",
    supportsNegativePrompt: true
  },
  {
    costEstimateType: "per_megapixel",
    costEstimateUsd: 0,
    id: "fal-ai/fast-sdxl/inpainting",
    imageField: "image_url",
    label: "Fast SDXL Inpainting",
    maskField: "mask_url",
    outputFormatField: "format",
    supportsNegativePrompt: true
  },
  {
    costEstimateType: "per_megapixel",
    costEstimateUsd: 0.035,
    id: "fal-ai/flux-lora/inpainting",
    imageField: "image_url",
    label: "Flux LoRA Inpainting",
    maskField: "mask_url",
    outputFormatField: "output_format",
    supportsNegativePrompt: false
  },
  {
    costEstimateType: "per_image",
    costEstimateUsd: 0.08,
    id: "fal-ai/ideogram/v2/edit",
    imageField: "image_url",
    label: "Ideogram v2 Edit",
    maskField: "mask_url",
    outputFormatField: null,
    supportsNegativePrompt: true
  },
  {
    costEstimateType: "per_megapixel",
    costEstimateUsd: 0.03,
    id: "fal-ai/qwen-image-edit/inpaint",
    imageField: "image_url",
    label: "Qwen Image Edit Inpaint",
    maskField: "mask_url",
    outputFormatField: "output_format",
    supportsNegativePrompt: true
  },
  {
    costEstimateType: "per_megapixel",
    costEstimateUsd: 0.01,
    id: "fal-ai/z-image/turbo/inpaint",
    imageField: "image_url",
    label: "Z-Image Turbo Inpaint",
    maskField: "mask_image_url",
    outputFormatField: "output_format",
    supportsNegativePrompt: false
  }
];

export function getMapAiModelConfig(modelId: string) {
  return MAP_AI_SUPPORTED_MODELS.find((model) => model.id === modelId) ?? null;
}

export function sanitizeMapAiSlug(value: string) {
  return value
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}
