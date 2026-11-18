const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 160 * 1024;
const MAX_DIMENSION = 512;

function fitSize(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('invalid_image'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read_error'));
    reader.readAsDataURL(blob);
  });
}

export async function compressLogoFile(file: File): Promise<string> {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('invalid_image');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('file_too_large');
  }

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width || MAX_DIMENSION;
  const sourceHeight = image.naturalHeight || image.height || MAX_DIMENSION;

  if (sourceWidth < 64 || sourceHeight < 64) {
    throw new Error('image_too_small');
  }

  const webpSupported =
    typeof document !== 'undefined' &&
    (() => {
      const canvas = document.createElement('canvas');
      return canvas.toDataURL('image/webp').startsWith('data:image/webp');
    })();

  let maxDimension = MAX_DIMENSION;
  let quality = 0.86;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { width, height } = fitSize(sourceWidth, sourceHeight, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas_unavailable');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const preferredType = webpSupported ? 'image/webp' : 'image/png';
    const blob = await canvasToBlob(canvas, preferredType, quality);
    if (!blob) throw new Error('canvas_unavailable');

    if (blob.size <= MAX_OUTPUT_BYTES) {
      return blobToDataUrl(blob);
    }

    if (quality > 0.42) {
      quality = Math.max(0.4, quality - 0.12);
    } else {
      maxDimension = Math.max(96, Math.round(maxDimension * 0.82));
    }
  }

  throw new Error('output_too_large');
}
