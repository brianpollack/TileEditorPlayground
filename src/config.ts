import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRootUrl = new URL("../", import.meta.url);

export const PROJECT_ROOT = fileURLToPath(projectRootUrl);
export const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
export const OPENROUTER_DIR = path.join(PROJECT_ROOT, "openrouter");
export const PROMPTS_DIR = path.join(PROJECT_ROOT, "prompts");
export const MAPS_DIR = path.join(PROJECT_ROOT, "maps");

export const REFERENCE_IMAGE_PATH = path.join(OUTPUT_DIR, "reference.png");
export const OUTPUT_IMAGE_PATH = path.join(OUTPUT_DIR, "test.png");
export const OUTPUT_TEXT_PATH = path.join(OUTPUT_DIR, "test.prompt.txt");
export const OUTPUT_LOG_PATH = path.join(OUTPUT_DIR, "logs.json");
export const MODELS_PATH = path.join(OPENROUTER_DIR, "models.json");
export const PROMPT_PATH = path.join(PROMPTS_DIR, "TerrainFromTemplate.md");

export const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
export const TEST_MODEL = "google/gemini-2.5-flash-image";

export const OPENROUTER_APP_HEADERS = {
  "HTTP-Referer": "http://gentiles.protovateai.com",
  "X-OpenRouter-Title": "GenTiles"
} as const;
