import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PROJECT_ROOT } from "./config.js";

interface KeepImageGroup {
  balancedImagePath?: string;
  baseName: string;
  finalImagePath?: string;
  folderName: string;
  mixImagePath?: string;
  modelName: string;
  referenceImagePath?: string;
}

const KEEP_DIR = path.join(PROJECT_ROOT, "keep");
const KEEP_REPORT_PATH = path.join(KEEP_DIR, "report.html");

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function toPosixRelativePath(fromPath: string, toPath: string): string {
  return path.relative(path.dirname(fromPath), toPath).split(path.sep).join("/");
}

function toProjectRelativePath(targetPath: string): string {
  return path.relative(PROJECT_ROOT, targetPath).split(path.sep).join("/");
}

function extractBaseName(fileName: string): string | null {
  if (fileName.endsWith(".balanced.png")) {
    return fileName.slice(0, -".balanced.png".length);
  }

  if (fileName.endsWith(".reference.png")) {
    return fileName.slice(0, -".reference.png".length);
  }

  if (fileName.endsWith(".mix.png")) {
    return fileName.slice(0, -".mix.png".length);
  }

  if (fileName.endsWith(".png")) {
    return fileName.slice(0, -".png".length);
  }

  return null;
}

function deriveModelName(baseName: string): string {
  const separatorIndex = baseName.indexOf("_");

  if (separatorIndex === -1) {
    return baseName;
  }

  return baseName.slice(separatorIndex + 1);
}

async function listKeepFolderNames(): Promise<string[]> {
  const entries = await fs.readdir(KEEP_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() && /^\d+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(left) - Number(right));
}

async function collectKeepGroups(): Promise<KeepImageGroup[]> {
  const folderNames = await listKeepFolderNames();
  const groups: KeepImageGroup[] = [];

  for (const folderName of folderNames) {
    const folderPath = path.join(KEEP_DIR, folderName);
    const fileNames = await fs.readdir(folderPath);
    const folderGroups = new Map<string, KeepImageGroup>();

    for (const fileName of fileNames) {
      const baseName = extractBaseName(fileName);

      if (!baseName) {
        continue;
      }

      const existingGroup = folderGroups.get(baseName) ?? {
        baseName,
        folderName,
        modelName: deriveModelName(baseName)
      };
      const filePath = path.join(folderPath, fileName);

      if (fileName.endsWith(".reference.png")) {
        existingGroup.referenceImagePath = filePath;
      } else if (fileName.endsWith(".balanced.png")) {
        existingGroup.balancedImagePath = filePath;
      } else if (fileName.endsWith(".mix.png")) {
        existingGroup.mixImagePath = filePath;
      } else if (fileName.endsWith(".png")) {
        existingGroup.finalImagePath = filePath;
      }

      folderGroups.set(baseName, existingGroup);
    }

    groups.push(...folderGroups.values());
  }

  return groups;
}

function renderImagePanel(input: {
  label: string;
  reportPath: string;
  sourcePath: string | undefined;
}): string {
  if (!input.sourcePath) {
    return `
      <div class="image-panel is-missing">
        <div class="image-label">${escapeHtml(input.label)}</div>
        <div class="missing-copy">Missing image</div>
      </div>
    `;
  }

  const relativeImagePath = toPosixRelativePath(input.reportPath, input.sourcePath);

  return `
    <div class="image-panel">
      <div class="image-label">${escapeHtml(input.label)}</div>
      <a href="${escapeHtml(relativeImagePath)}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(relativeImagePath)}" alt="${escapeHtml(input.label)}" loading="lazy" />
      </a>
    </div>
  `;
}

function renderTileServerButton(outputImagePath: string | undefined): string {
  if (!outputImagePath) {
    return "";
  }

  const tileServerUrl = new URL("http://localhost:5173/");
  tileServerUrl.searchParams.set("image", toProjectRelativePath(outputImagePath));

  return `
    <a class="tile-server-link" href="${escapeHtml(tileServerUrl.toString())}" target="_blank" rel="noreferrer">
      Open in Tile Server
    </a>
  `;
}

function buildReportHtml(groups: KeepImageGroup[]): string {
  const cards = groups
    .map((group) => {
      return `
        <section class="keep-card">
          <header class="card-header">
            <div class="folder-name">Folder ${escapeHtml(group.folderName)}</div>
            <div class="title-row">
              <div class="model-name">${escapeHtml(group.modelName)}</div>
              ${renderTileServerButton(group.finalImagePath)}
            </div>
            <div class="base-name">${escapeHtml(group.baseName)}</div>
          </header>
          <div class="image-grid">
            ${renderImagePanel({
              label: "Reference",
              reportPath: KEEP_REPORT_PATH,
              sourcePath: group.referenceImagePath
            })}
            ${renderImagePanel({
              label: "Output",
              reportPath: KEEP_REPORT_PATH,
              sourcePath: group.finalImagePath
            })}
            ${renderImagePanel({
              label: "Mix",
              reportPath: KEEP_REPORT_PATH,
              sourcePath: group.mixImagePath
            })}
            ${renderImagePanel({
              label: "Balanced",
              reportPath: KEEP_REPORT_PATH,
              sourcePath: group.balancedImagePath
            })}
          </div>
        </section>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GameTiles Keep Report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --card: #fffaf2;
        --line: #d8cab6;
        --text: #2f2518;
        --muted: #74624c;
        --accent: #6c8b58;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(108, 139, 88, 0.16), transparent 28%),
          linear-gradient(180deg, #f8f3ec 0%, var(--bg) 100%);
        color: var(--text);
      }

      main {
        width: min(1900px, calc(100vw - 24px));
        margin: 0 auto;
        padding: 32px 0 64px;
      }

      .page-header {
        margin-bottom: 24px;
        padding: 24px 28px;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: rgba(255, 250, 242, 0.92);
        backdrop-filter: blur(6px);
      }

      h1 {
        margin: 0 0 8px;
        font-size: clamp(28px, 4vw, 42px);
      }

      .summary {
        color: var(--muted);
        font-size: 15px;
      }

      .report-grid {
        display: grid;
        gap: 18px;
      }

      .keep-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--card);
        overflow: hidden;
        box-shadow: 0 10px 28px rgba(65, 47, 26, 0.08);
      }

      .card-header {
        padding: 18px 20px 16px;
        border-bottom: 1px solid rgba(216, 202, 182, 0.8);
        background: linear-gradient(135deg, rgba(108, 139, 88, 0.12), rgba(255, 250, 242, 0.8));
      }

      .folder-name {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .model-name {
        font-size: 24px;
        font-weight: 700;
        word-break: break-word;
      }

      .title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-top: 6px;
      }

      .tile-server-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        padding: 0 14px;
        border-radius: 999px;
        background: #6c8b58;
        color: white;
        font-size: 14px;
        font-weight: 700;
        text-decoration: none;
        white-space: nowrap;
      }

      .base-name {
        margin-top: 6px;
        color: var(--muted);
        font-size: 14px;
        word-break: break-word;
      }

      .image-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        padding: 18px;
      }

      .image-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .image-label {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .image-panel a {
        display: block;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(216, 202, 182, 0.9);
        background: #f3ede3;
      }

      .image-panel img {
        display: block;
        width: 100%;
        height: auto;
        aspect-ratio: 1 / 1;
        object-fit: cover;
      }

      .is-missing {
        justify-content: center;
        min-height: 260px;
        padding: 18px;
        border: 1px dashed rgba(116, 98, 76, 0.45);
        border-radius: 14px;
        background: rgba(244, 239, 231, 0.7);
      }

      .missing-copy {
        color: var(--muted);
        font-size: 14px;
      }

      @media (max-width: 1200px) {
        .image-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 720px) {
        .title-row {
          flex-direction: column;
          align-items: flex-start;
        }

        .image-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="page-header">
        <h1>Keep Report</h1>
        <div class="summary">${escapeHtml(`Archived runs: ${groups.length}`)}</div>
      </header>
      <div class="report-grid">
        ${cards}
      </div>
    </main>
  </body>
</html>
`;
}

export async function generateKeepReport(): Promise<{
  itemCount: number;
  reportPath: string;
}> {
  const groups = await collectKeepGroups();
  const reportHtml = buildReportHtml(groups);

  await fs.writeFile(KEEP_REPORT_PATH, reportHtml, "utf8");

  return {
    itemCount: groups.length,
    reportPath: KEEP_REPORT_PATH
  };
}

async function main(): Promise<void> {
  const result = await generateKeepReport();

  console.log(`Keep report written to ${result.reportPath}`);
  console.log(`Items included: ${result.itemCount}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
