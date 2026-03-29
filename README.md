# TileEditorPlayground

This repository is a local playground for experimenting with tile generation, terrain reference images, and a browser-based tile editor.

It contains two main parts:

- `GameTiles`: a Node.js + TypeScript toolchain for generating terrain references from `maps/`, applying prompts from `prompts/`, and running image-model workflows against local reference material in `raw/` and `reference/`.
- `tile_server_19`: a React 19 + Vite tile workshop for slicing tiles from source images, painting layered slot art, managing a tile library, and editing JSON-backed maps locally.

Tracked project content includes `maps/`, `prompts/`, `raw/`, `reference/`, and `tile_server_19/` source/data files. Generated output, reports, build artifacts, secrets, and local machine config are intentionally excluded from Git.

## Requirements

- Node.js 20+
- npm
- Optional API access for the generation pipeline:
  - `OPENROUTER_API_KEY`
  - `FAL_KEY`
- Optional Font Awesome npm access for `tile_server_19`

## Setup

### Root project

Install dependencies:

```bash
npm install
```

Create a local `.env` from `.env.example` and add your keys:

```bash
OPENROUTER_API_KEY=your_openrouter_api_key_here
FAL_KEY=your_fal_api_key_here
```

The root `.env` is local-only and is ignored by Git.

### `tile_server_19`

Install the tile editor dependencies:

```bash
npm install --prefix tile_server_19
```

If you need the Font Awesome kit dependency, create `tile_server_19/.npmrc` locally with your own token:

```ini
@awesome.me:registry=https://npm.fontawesome.com/
@fortawesome:registry=https://npm.fontawesome.com/
//npm.fontawesome.com/:_authToken=YOUR_FONTAWESOME_TOKEN
```

That `.npmrc` file is also local-only and is ignored by Git.

## Useful Commands

### Root project

```bash
npm run build
npm run typecheck
npm run gen -- map1 "gemini.*" TerrainFromTemplate
npm run gen:keep-report
```

### Tile editor (`tile_server_19`)

```bash
npm run tile:dev
npm run tile:build
npm run tile:preview
npm run tile:typecheck
```

## Git Notes

- `tile_server_19` is now intended to live inside this main repository instead of as a nested Git repository.
- Secrets, auth tokens, generated reports, `keep/`, `fail/`, `output/`, build output, temp clipboard data, and local `.npmrc` / `.env` files should not be committed.

## License

This repository uses the custom non-commercial license in [LICENSE](/Users/brian/Projects/GameTiles/LICENSE). You are welcome to use, study, and modify this test code, but commercial use or resale requires prior written permission from the author.
