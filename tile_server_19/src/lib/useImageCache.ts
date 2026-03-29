import { useRef, useState } from "react";

import { loadImageFromUrl } from "./images";

export function useImageCache() {
  const imageCacheRef = useRef(new Map<string, HTMLImageElement | null>());
  const imagePromisesRef = useRef(new Map<string, Promise<HTMLImageElement | null>>());
  const [, setVersion] = useState(0);

  async function ensureImage(imageUrl: string) {
    const cachedImage = imageCacheRef.current.get(imageUrl);

    if (cachedImage !== undefined) {
      return cachedImage;
    }

    const pendingImage = imagePromisesRef.current.get(imageUrl);

    if (pendingImage) {
      return pendingImage;
    }

    const nextPromise = loadImageFromUrl(imageUrl)
      .then((image) => {
        imageCacheRef.current.set(imageUrl, image);
        imagePromisesRef.current.delete(imageUrl);
        setVersion((value) => value + 1);
        return image;
      })
      .catch(() => {
        imageCacheRef.current.set(imageUrl, null);
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
      return imageCacheRef.current.get(imageUrl);
    }
  };
}
