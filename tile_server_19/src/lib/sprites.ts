import { TILE_SIZE } from "./constants";
import type { SpriteRecord } from "../types";

export function getDefaultSpriteMount(imageWidth: number, imageHeight: number) {
  if (imageWidth === TILE_SIZE && imageHeight === TILE_SIZE * 2) {
    return {
      mount_x: imageWidth / 2,
      mount_y: imageHeight - TILE_SIZE / 2
    };
  }

  return {
    mount_x: imageWidth / 2,
    mount_y: imageHeight / 2
  };
}

export function spriteUsesDefaultMount(
  spriteRecord: Pick<SpriteRecord, "image_h" | "image_w" | "mount_x" | "mount_y">
) {
  const defaultMount = getDefaultSpriteMount(spriteRecord.image_w, spriteRecord.image_h);

  return (
    spriteRecord.mount_x === defaultMount.mount_x &&
    spriteRecord.mount_y === defaultMount.mount_y
  );
}
