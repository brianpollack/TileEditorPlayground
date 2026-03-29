for F in map{7,8}; do
  npm run gen -- --lines "$F" "fal/nano-banana-2/edit" TerrainFromTemplate
  # npm run gen -- "$F" "fal/nano-banana-2/edit" TerrainFromTemplate
  # npm run gen -- --lines "$F" "fal/flux-pro/kontext" TerrainFromTemplate
  npm run gen -- --lines "$F" "gemini.*pro" TerrainFromTemplate
  # npm run gen -- --lines "$F" "fal/phota/edit" TerrainFromTemplate
  # npm run gen -- "$F" "gpt" TerrainFromTemplate
  # npm run gen -- "$F" "fal-ai/bytedance/seedream/v5/lite/edit" TerrainFromTemplate

  # npm run gen -- --lines "$F" "gemini.*pro" TerrainFromTemplate
done

