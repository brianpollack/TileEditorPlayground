#!/usr/bin/env bash

set -euo pipefail

models=(
  "fal/imagen4/preview"
  "gemini.*pro"
  "seed"
  "river.*v2.*pro"
  "fal/z-image/turbo/tiling"
  "fal/nano-banana-2"
  "fal/flux-pro/v1.1"
  "fal/qwen-image-2/text-to-image"
)

prompts=(
#   "grass1.md"
#   "house1.md"
    "house2.md"
    "tree1.md"
)

for model in "${models[@]}"; do
  for prompt in "${prompts[@]}"; do
    prefix="${prompt%.md}/"

    npm run gen:image -- \
      --model "$model" \
      --prompt "$prompt" \
      --prefix "$prefix"
  done
done
