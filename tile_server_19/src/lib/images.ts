export async function loadImageFromUrl(imageUrl: string) {
  const image = new Image();
  const loadPromise = new Promise<void>((resolve, reject) => {
    image.onload = () => {
      resolve();
    };
    image.onerror = () => {
      reject(new Error("Could not load image."));
    };
  });

  image.decoding = "async";
  image.src = imageUrl;

  if (typeof image.decode !== "function") {
    await loadPromise;
    return image;
  }

  try {
    await Promise.race([image.decode(), loadPromise]);
  } catch {
    await loadPromise;
  }

  return image;
}

export function getBaseName(filePath: string) {
  return filePath.split(/[\\/]/u).pop() ?? filePath;
}

export function revokeObjectUrl(url: string | null) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function triggerDownload(dataUrl: string, fileName: string) {
  const anchor = document.createElement("a");

  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}
