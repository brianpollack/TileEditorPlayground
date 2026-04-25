import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const WORKSPACE_ROOT = path.resolve(APP_ROOT, "..");
const ENV_PATH = path.join(WORKSPACE_ROOT, ".env");

function unquoteEnvValue(value: string) {
  const trimmedValue = value.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

function readEnvValueFromFile(key: string) {
  if (!existsSync(ENV_PATH)) {
    return "";
  }

  const fileContents = readFileSync(ENV_PATH, "utf8");

  for (const line of fileContents.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const currentKey = trimmedLine.slice(0, separatorIndex).trim();

    if (currentKey !== key) {
      continue;
    }

    return unquoteEnvValue(trimmedLine.slice(separatorIndex + 1));
  }

  return "";
}

export function getEnvValue(key: string) {
  const processValue = typeof process.env[key] === "string" ? process.env[key]?.trim() ?? "" : "";
  return processValue || readEnvValueFromFile(key);
}

export function getVaxServer() {
  return getEnvValue("VAX_SERVER").replace(/\/+$/u, "");
}

export function getVaxAdminKey() {
  return getEnvValue("VAX_ADMIN_KEY");
}

export function getOpenRouterApiKey() {
  return getEnvValue("OPENROUTER_API_KEY");
}

export function getR2Bucket() {
  return getEnvValue("R2_BUCKET").replace(/\/+$/u, "");
}

export function getR2Token() {
  return getEnvValue("R2_TOKEN");
}

export function getR2UserAccessKey() {
  return getEnvValue("R2_USER_ACCESSKEY") || getEnvValue("R2_ACCESS_KEY_ID");
}

export function getR2UserSecret() {
  return getEnvValue("R2_USER_SECRET") || getEnvValue("R2_SECRET_ACCESS_KEY");
}
