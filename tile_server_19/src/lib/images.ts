export async function loadImageFromUrl(imageUrl: string) {
  const image = new Image();

  image.decoding = "async";
  image.src = imageUrl;
  await image.decode();

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
