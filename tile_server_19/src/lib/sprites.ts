import { TILE_SIZE } from "./constants";
import type { SpriteRecord } from "../types";

const TRANSPARENT_TRIM_ALPHA_RATIO = 0.1;
const TILE_HALF = TILE_SIZE / 2;

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

function isMostlyTransparent(alphaTotal: number, sampleCount: number) {
  return alphaTotal <= sampleCount * 255 * TRANSPARENT_TRIM_ALPHA_RATIO;
}

function snapBoundingOffsetToTileBoundary(offset: number, mountPoint: number) {
  const direction = offset < 0 ? -1 : 1;
  const magnitude = Math.abs(offset);
  const baseBoundary = Math.max(0, Math.trunc(mountPoint) - TILE_HALF - 1);
  const snappedMagnitude = Math.max(
    0,
    baseBoundary + Math.round((magnitude - baseBoundary) / TILE_SIZE) * TILE_SIZE
  );

  return direction * snappedMagnitude;
}

function snapBoundingSizeToTileBoundary(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return 0;
  }

  return Math.max(TILE_SIZE, Math.round(size / TILE_SIZE) * TILE_SIZE);
}

export function snapSpriteBoundingBoxToTileGrid(
  spriteRecord: Pick<SpriteRecord, "bounding_h" | "bounding_w" | "bounding_x" | "bounding_y" | "mount_x" | "mount_y">
) {
  const snappedLeft = snapBoundingOffsetToTileBoundary(spriteRecord.bounding_x, spriteRecord.mount_x);
  const snappedTop = snapBoundingOffsetToTileBoundary(spriteRecord.bounding_y, spriteRecord.mount_y);
  const snappedRight = snapBoundingOffsetToTileBoundary(
    spriteRecord.bounding_x + spriteRecord.bounding_w,
    spriteRecord.mount_x
  );
  const snappedBottom = snapBoundingOffsetToTileBoundary(
    spriteRecord.bounding_y + spriteRecord.bounding_h,
    spriteRecord.mount_y
  );

  return {
    bounding_h: Math.max(TILE_SIZE, snappedBottom - snappedTop) || snapBoundingSizeToTileBoundary(spriteRecord.bounding_h),
    bounding_w: Math.max(TILE_SIZE, snappedRight - snappedLeft) || snapBoundingSizeToTileBoundary(spriteRecord.bounding_w),
    bounding_x: snappedLeft,
    bounding_y: snappedTop
  };
}

/**
 * Finds a tight sprite-content box by trimming edge rows and columns whose
 * average alpha is at most 10% opaque.
 *
 * This does not try to find disconnected islands inside the image. It only trims
 * the outer edges until it reaches columns and rows that appear meaningfully
 * occupied. That keeps the result stable while still removing soft empty padding.
 *
 * The returned box is expressed in source-image pixel coordinates.
 */
export function getTrimmedSpriteImageBounds(
  imageWidth: number,
  imageHeight: number,
  getAlphaAt: (x: number, y: number) => number
) {
  const getColumnAlphaTotal = (columnIndex: number) => {
    let alphaTotal = 0;

    for (let y = 0; y < imageHeight; y += 1) {
      alphaTotal += getAlphaAt(columnIndex, y);
    }

    return alphaTotal;
  };

  const getRowAlphaTotal = (rowIndex: number) => {
    let alphaTotal = 0;

    for (let x = 0; x < imageWidth; x += 1) {
      alphaTotal += getAlphaAt(x, rowIndex);
    }

    return alphaTotal;
  };

  let left = 0;
  while (left < imageWidth && isMostlyTransparent(getColumnAlphaTotal(left), imageHeight)) {
    left += 1;
  }

  let right = imageWidth - 1;
  while (right >= left && isMostlyTransparent(getColumnAlphaTotal(right), imageHeight)) {
    right -= 1;
  }

  let top = 0;
  while (top < imageHeight && isMostlyTransparent(getRowAlphaTotal(top), imageWidth)) {
    top += 1;
  }

  let bottom = imageHeight - 1;
  while (bottom >= top && isMostlyTransparent(getRowAlphaTotal(bottom), imageWidth)) {
    bottom -= 1;
  }

  if (left > right || top > bottom) {
    return {
      height: imageHeight,
      left: 0,
      top: 0,
      width: imageWidth
    };
  }

  return {
    height: bottom - top + 1,
    left,
    top,
    width: right - left + 1
  };
}

/**
 * Converts a trimmed image-space content box into sprite bounding-box metadata.
 *
 * The stored values are relative to the sprite mount point rather than absolute
 * image coordinates. This means `bounding_x` and `bounding_y` are usually negative
 * when the sprite extends left/up from the mount point.
 *
 * After the tight box is found, its left, top, right, and bottom edges are all
 * snapped to tile-space boundaries. The stored `bounding_w` and `bounding_h`
 * then come from the snapped right/bottom edges minus the snapped left/top edges.
 *
 * Example:
 *
 * - raw `bounding_x = -602`
 * - `mount_x = 616`
 * - nearest snapped tile boundary magnitude is `551`
 * - stored `bounding_x` becomes `-551`
 */
export function getSpriteBoundingBox(
  spriteRecord: Pick<SpriteRecord, "image_h" | "image_w" | "mount_x" | "mount_y">,
  getAlphaAt: (x: number, y: number) => number
) {
  const bounds = getTrimmedSpriteImageBounds(spriteRecord.image_w, spriteRecord.image_h, getAlphaAt);

  return {
    ...snapSpriteBoundingBoxToTileGrid({
      bounding_h: bounds.height,
      bounding_w: bounds.width,
      bounding_x: bounds.left - spriteRecord.mount_x,
      bounding_y: bounds.top - spriteRecord.mount_y,
      mount_x: spriteRecord.mount_x,
      mount_y: spriteRecord.mount_y
    })
  };
}

/**
 * Computes how many map tiles a sprite occupies around its mount point.
 *
 * Tile space is defined relative to the center tile, not by scanning opaque pixels.
 * The mount point is the sprite pixel that is anchored to the center of tile `0,0`.
 * For a `128x128` tile, that center sits `64` pixels from each tile edge.
 *
 * The calculation works by placing the sprite image around that center tile and then
 * counting how many whole extra tiles the image extends into on each side:
 *
 * - `coveredTilesLeft`: how many tiles the sprite reaches into left of the center tile
 * - `coveredTilesRight`: how many tiles the sprite reaches into right of the center tile
 * - `coveredTilesUp`: how many tiles the sprite reaches into above the center tile
 * - `coveredTilesDown`: how many tiles the sprite reaches into below the center tile
 *
 * The final footprint always includes the center tile itself:
 *
 * - `tile_w = coveredTilesLeft + 1 + coveredTilesRight`
 * - `tile_h = coveredTilesUp + 1 + coveredTilesDown`
 *
 * Example: `image_w = 252`, `mount_x = 135`, `TILE_SIZE = 128`
 *
 * - center of the anchor tile is `64` pixels from the left edge
 * - sprite reaches `135` pixels left from the mount point
 * - `135 - 64 = 71`, so the sprite extends into tile `-1`
 * - sprite width is `252`, so after using `135` pixels on the left side of the mount,
 *   there are `117` pixels on the right side
 * - `117 - 64 = 53`, so the sprite also extends into tile `+1`
 * - total width is `3` tiles: left neighbor, center tile, right neighbor
 *
 * Example: `image_h = 154`, `mount_y = 90`, `TILE_SIZE = 128`
 *
 * - center of the anchor tile is `64` pixels from the top edge
 * - sprite reaches `90` pixels upward from the mount point
 * - `90 - 64 = 26`, so the sprite extends into the tile above
 * - the remaining height below the mount point is `154 - 90 = 64`
 * - that exactly fills the lower half of the center tile and does not spill downward
 * - total height is `2` tiles: the tile above plus the center tile
 *
 * This helper is the source of truth for saved `tile_w` and `tile_h`.
 */
export function getSpriteTileFootprint(
  spriteRecord: Pick<SpriteRecord, "image_h" | "image_w" | "mount_x" | "mount_y">
) {
  const imageLeftFromOrigin = TILE_SIZE / 2 - spriteRecord.mount_x;
  const imageTopFromOrigin = TILE_SIZE / 2 - spriteRecord.mount_y;
  const imageRightFromOrigin = imageLeftFromOrigin + spriteRecord.image_w;
  const imageBottomFromOrigin = imageTopFromOrigin + spriteRecord.image_h;
  const coveredTilesLeft = Math.ceil(Math.max(0, -imageLeftFromOrigin) / TILE_SIZE);
  const coveredTilesRight = Math.ceil(Math.max(0, imageRightFromOrigin - TILE_SIZE) / TILE_SIZE);
  const coveredTilesUp = Math.ceil(Math.max(0, -imageTopFromOrigin) / TILE_SIZE);
  const coveredTilesDown = Math.ceil(Math.max(0, imageBottomFromOrigin - TILE_SIZE) / TILE_SIZE);

  return {
    tile_h: coveredTilesUp + 1 + coveredTilesDown,
    tile_w: coveredTilesLeft + 1 + coveredTilesRight
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
