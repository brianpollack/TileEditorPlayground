#!/usr/bin/env bash

set -euo pipefail

models=(
  "fal-ai/ernie-image/turbo"
  "fal-ai/ernie-image"
  "fal/nano-banana-2"
  "fal/qwen-image-2/text-to-image"
  "fal/qwen-image-2/pro/text-to-image"
  "fal/flux-2-pro"
  "fal-ai/wan/v2.7/pro/text-to-image"
  "fal/wan/v2.7/pro/text-to-image"
  "black-forest-labs/flux.2-klein-4b"
  "openai/gpt-5-image"
  "openai/gpt-5-image-mini"
  "gemini.*pro"
  "seed"
)

prompts=(
  "explorer_f.md"
)

for model in "${models[@]}"; do
for prompt in "${prompts[@]}"; do
    prefix="${prompt%.md}/"

    echo "---------------------=====[ $model - $prompt ]=====---------------------"

    npm run gen:image -- \
      --model "$model" \
      --prompt "$prompt" \
      --prefix "$prefix" 2>&1
  done
done
