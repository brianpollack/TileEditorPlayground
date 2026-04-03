import { useRef, useState } from "react";

import { loadImageFromUrl } from "./images";

const DEFAULT_MAX_IMAGE_CACHE_ENTRIES = 160;
const DEFAULT_MAX_TRANSIENT_IMAGE_CACHE_ENTRIES = 48;

interface UseImageCacheOptions {
  maxEntries?: number;
  maxTransientEntries?: number;
}

interface CachedImageEntry {
  image: HTMLImageElement | null;
  isTransient: boolean;
}

function isTransientImageUrl(imageUrl: string) {
  return imageUrl.startsWith("blob:") || imageUrl.startsWith("data:");
}

export function useImageCache(options: UseImageCacheOptions = {}) {
  const imageCacheRef = useRef(new Map<string, CachedImageEntry>());
  const imagePromisesRef = useRef(new Map<string, Promise<HTMLImageElement | null>>());
  const [, setVersion] = useState(0);

  function trimCache() {
    const imageCache = imageCacheRef.current;
    const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_IMAGE_CACHE_ENTRIES);
    const maxTransientEntries = Math.max(
      0,
      options.maxTransientEntries ?? DEFAULT_MAX_TRANSIENT_IMAGE_CACHE_ENTRIES
    );

    while (imageCache.size > maxEntries) {
      const oldestKey = imageCache.keys().next().value;

      if (typeof oldestKey !== "string") {
        break;
      }

      imageCache.delete(oldestKey);
    }

    let transientCount = 0;

    for (const entry of imageCache.values()) {
      if (entry.isTransient) {
        transientCount += 1;
      }
    }

    if (transientCount <= maxTransientEntries) {
      return;
    }

    for (const [cacheKey, entry] of imageCache) {
      if (!entry.isTransient) {
        continue;
      }

      imageCache.delete(cacheKey);
      transientCount -= 1;

      if (transientCount <= maxTransientEntries) {
        break;
      }
    }
  }

  function setCachedImage(imageUrl: string, image: HTMLImageElement | null) {
    const nextEntry = {
      image,
      isTransient: isTransientImageUrl(imageUrl)
    };

    imageCacheRef.current.delete(imageUrl);
    imageCacheRef.current.set(imageUrl, nextEntry);
    trimCache();
  }

  async function ensureImage(imageUrl: string) {
    const cachedImageEntry = imageCacheRef.current.get(imageUrl);

    if (cachedImageEntry !== undefined) {
      imageCacheRef.current.delete(imageUrl);
      imageCacheRef.current.set(imageUrl, cachedImageEntry);
      return cachedImageEntry.image;
    }

    const pendingImage = imagePromisesRef.current.get(imageUrl);

    if (pendingImage) {
      return pendingImage;
    }

    const nextPromise = loadImageFromUrl(imageUrl)
      .then((image) => {
        setCachedImage(imageUrl, image);
        imagePromisesRef.current.delete(imageUrl);
        setVersion((value) => value + 1);
        return image;
      })
      .catch(() => {
        setCachedImage(imageUrl, null);
        imagePromisesRef.current.delete(imageUrl);
        setVersion((value) => value + 1);
        return null;
      });

    imagePromisesRef.current.set(imageUrl, nextPromise);
    return nextPromise;
  }

  return {
    ensureImage,
    getCachedImage(imageUrl: string) {
      const cachedImageEntry = imageCacheRef.current.get(imageUrl);

      if (!cachedImageEntry) {
        return undefined;
      }

      imageCacheRef.current.delete(imageUrl);
      imageCacheRef.current.set(imageUrl, cachedImageEntry);
      return cachedImageEntry.image;
    },
    deleteImage(imageUrl: string) {
      imagePromisesRef.current.delete(imageUrl);
      imageCacheRef.current.delete(imageUrl);
    },
    clear(predicate?: (imageUrl: string) => boolean) {
      if (!predicate) {
        imagePromisesRef.current.clear();
        imageCacheRef.current.clear();
        return;
      }

      for (const cacheKey of imageCacheRef.current.keys()) {
        if (predicate(cacheKey)) {
          imageCacheRef.current.delete(cacheKey);
        }
      }

      for (const cacheKey of imagePromisesRef.current.keys()) {
        if (predicate(cacheKey)) {
          imagePromisesRef.current.delete(cacheKey);
        }
      }
    }
  };
}
