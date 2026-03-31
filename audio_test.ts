import "dotenv/config";

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const SOUND_PROMPT = "Door closing behind you and a lock slides in places and latches shut";
const OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_MODEL_ID = "eleven_text_to_sound_v2";
const FILE_STEM = "door_lock_sound_effect";

type SubscriptionSnapshot = {
  tier: string;
  characterCount: number;
  characterLimit: number;
  remainingCharacters: number;
  nextResetAt?: string;
};

type AudioProbe = {
  formatId?: string;
  channels?: number;
  sampleRateHz?: number;
  estimatedDurationSeconds?: number;
  audioBytes?: number;
  audioPackets?: number;
  bitRateBitsPerSecond?: number;
  raw: string;
};

const execFile = promisify(execFileCallback);
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(projectRoot, "output", "audio_test");
const outputPath = path.join(outputDir, `${FILE_STEM}.mp3`);
const statsPath = path.join(outputDir, `${FILE_STEM}.stats.json`);

function getApiKey(): string {
  const apiKey = process.env.ELEVENLABS_KEY ?? process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_KEY in .env");
  }

  return apiKey;
}

function headersToObject(headers: Headers | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

function getHeader(headers: Record<string, string>, ...names: string[]): string | undefined {
  for (const name of names) {
    const match = Object.entries(headers).find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase());

    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function toIsoString(unixSeconds: number | undefined): string | undefined {
  if (unixSeconds === undefined) {
    return undefined;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function bytesToKiB(bytes: number): number {
  return Number((bytes / 1024).toFixed(2));
}

function bytesToMiB(bytes: number): number {
  return Number((bytes / (1024 * 1024)).toFixed(4));
}

function outputFormatToMimeType(outputFormat: string): string | null {
  if (outputFormat.startsWith("mp3_")) {
    return "audio/mpeg";
  }

  if (outputFormat.startsWith("opus_")) {
    return "audio/ogg; codecs=opus";
  }

  if (outputFormat.startsWith("pcm_")) {
    return "audio/pcm";
  }

  if (outputFormat.startsWith("ulaw_")) {
    return "audio/basic";
  }

  if (outputFormat.startsWith("alaw_")) {
    return "audio/aiff";
  }

  return null;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function getSubscriptionSnapshot(client: ElevenLabsClient): Promise<SubscriptionSnapshot | null> {
  try {
    const subscription = await client.user.subscription.get();

    return {
      tier: subscription.tier,
      characterCount: subscription.characterCount,
      characterLimit: subscription.characterLimit,
      remainingCharacters: subscription.characterLimit - subscription.characterCount,
      nextResetAt: toIsoString(subscription.nextCharacterCountResetUnix)
    };
  } catch {
    return null;
  }
}

async function probeAudio(filePath: string): Promise<AudioProbe | null> {
  try {
    const { stdout } = await execFile("/usr/bin/afinfo", [filePath]);

    return {
      formatId: stdout.match(/^File type ID:\s+(.+)$/m)?.[1]?.trim(),
      channels: parseOptionalNumber(stdout.match(/Data format:\s+(\d+)\sch,/m)?.[1]),
      sampleRateHz: parseOptionalNumber(stdout.match(/Data format:\s+\d+\sch,\s+(\d+)\sHz/m)?.[1]),
      estimatedDurationSeconds: parseOptionalNumber(stdout.match(/estimated duration:\s+([0-9.]+)\ssec/m)?.[1]),
      audioBytes: parseOptionalNumber(stdout.match(/^audio bytes:\s+(\d+)$/m)?.[1]),
      audioPackets: parseOptionalNumber(stdout.match(/^audio packets:\s+(\d+)$/m)?.[1]),
      bitRateBitsPerSecond: parseOptionalNumber(stdout.match(/^bit rate:\s+(\d+)\sbits per second$/m)?.[1]),
      raw: stdout
    };
  } catch {
    return null;
  }
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function main(): Promise<void> {
  const client = new ElevenLabsClient({
    apiKey: getApiKey()
  });
  const modelId = process.env.ELEVENLABS_SOUND_MODEL_ID ?? DEFAULT_MODEL_ID;
  const durationSeconds = parseOptionalNumber(process.env.ELEVENLABS_SOUND_DURATION_SECONDS);
  const promptInfluence = parseOptionalNumber(process.env.ELEVENLABS_SOUND_PROMPT_INFLUENCE);
  const loop = process.env.ELEVENLABS_SOUND_LOOP === "true";

  await mkdir(outputDir, { recursive: true });

  const startedAt = new Date();
  const subscriptionBefore = await getSubscriptionSnapshot(client);

  const requestStartedAt = performance.now();
  const response = await client.textToSoundEffects
    .convert({
      text: SOUND_PROMPT,
      outputFormat: OUTPUT_FORMAT,
      modelId,
      loop,
      durationSeconds,
      promptInfluence
    })
    .withRawResponse();
  const requestFinishedAt = new Date();
  const elapsedMs = Number((performance.now() - requestStartedAt).toFixed(2));

  const audioBuffer = await streamToBuffer(response.data);
  await writeFile(outputPath, audioBuffer);

  const fileStats = await stat(outputPath);
  const audioProbe = await probeAudio(outputPath);
  const headers = headersToObject(response.rawResponse.headers);
  const subscriptionAfter = await getSubscriptionSnapshot(client);
  const billedCharactersHeader = getHeader(headers, "character-cost");
  const subscriptionCharacterDelta =
    subscriptionBefore === null || subscriptionAfter === null
      ? null
      : subscriptionAfter.characterCount - subscriptionBefore.characterCount;

  const stats = {
    requestedAt: startedAt.toISOString(),
    completedAt: requestFinishedAt.toISOString(),
    elapsedMs,
    prompt: SOUND_PROMPT,
    promptLength: SOUND_PROMPT.length,
    output: {
      path: outputPath,
      statsPath,
      format: OUTPUT_FORMAT,
      contentType: outputFormatToMimeType(OUTPUT_FORMAT),
      sizeBytes: fileStats.size,
      sizeKiB: bytesToKiB(fileStats.size),
      sizeMiB: bytesToMiB(fileStats.size),
      audioProbe
    },
    request: {
      modelId,
      requestedDurationSeconds: durationSeconds ?? null,
      requestedPromptInfluence: promptInfluence ?? null,
      requestedLoop: loop,
      httpStatus: response.rawResponse.status,
      requestId: getHeader(headers, "request-id", "x-request-id", "xi-request-id", "x-amzn-requestid"),
      historyItemId: getHeader(headers, "history-item-id"),
      responseContentType: getHeader(headers, "content-type"),
      responseHeaders: headers
    },
    usage: {
      billedCharacters: billedCharactersHeader === undefined ? null : Number(billedCharactersHeader),
      subscriptionCharacterDelta,
      costUsd: null,
      costNote:
        "ElevenLabs does not expose a direct per-request USD cost in this sound-effects response, so cost is left null."
    },
    subscriptionBefore,
    subscriptionAfter
  };

  await writeFile(statsPath, `${JSON.stringify(stats, null, 2)}\n`, "utf8");

  console.log(`Audio file written to ${outputPath}`);
  console.log(`Stats file written to ${statsPath}`);
  console.log(JSON.stringify(stats, null, 2));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
