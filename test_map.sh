for F in map9; do
  npm run gen -- --lines "$F" "fal/nano-banana-2/edit" TerrainFromTemplate
  npm run gen -- "$F" "fal/nano-banana-2/edit" TerrainFromTemplate
  npm run gen -- --lines "$F" "fal/flux-pro/kontext" TerrainFromTemplate
  npm run gen -- --lines "$F" "gemini.*pro" TerrainFromTemplate
  npm run gen -- "$F" "gemini.*pro" TerrainFromTemplate
  npm run gen -- "$F" "fal/phota/edit" TerrainFromTemplate
  # npm run gen -- "$F" "gpt" TerrainFromTemplate
  npm run gen -- --lines "$F" "fal-ai/bytedance/seedream/v5/lite/edit" TerrainFromTemplate
  npm run gen -- --lines "$F" "gemini.*pro" TerrainFromTemplate
done

