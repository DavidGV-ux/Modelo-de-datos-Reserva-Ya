/** Debe coincidir con LOGO_RULES del Back: la validación se repite en el servidor. */
export const LOGO_RULES = {
  maxFileBytes: 8 * 1024 * 1024,
  maxOutputBytes: 160 * 1024,
  minDimension: 64,
  maxDimension: 512,
  types: ['image/png', 'image/jpeg', 'image/webp'],
} as const;

const MAX_FILE_BYTES = LOGO_RULES.maxFileBytes;
const MAX_OUTPUT_BYTES = LOGO_RULES.maxOutputBytes;
const MAX_DIMENSION = LOGO_RULES.maxDimension;

export function isSupportedLogoFile(file: File): boolean {
  return (LOGO_RULES.types as readonly string[]).includes(file.type);
}

export type LogoErrorKind = 'type' | 'small' | 'size' | 'generic';

export function logoErrorKind(error: unknown): LogoErrorKind {
  const message = error instanceof Error ? error.message : '';
  if (message === 'invalid_image' || message === 'unsupported_type') return 'type';
  if (message === 'image_too_small') return 'small';
  if (message === 'file_too_large' || message === 'output_too_large') return 'size';
  return 'generic';
}

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
  if (!file || !isSupportedLogoFile(file)) {
    throw new Error('unsupported_type');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('file_too_large');
  }

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width || MAX_DIMENSION;
  const sourceHeight = image.naturalHeight || image.height || MAX_DIMENSION;

  if (sourceWidth < LOGO_RULES.minDimension || sourceHeight < LOGO_RULES.minDimension) {
    throw new Error('image_too_small');
  }

  const webpSupported =
    typeof document !== 'undefined' &&
    (() => {
      const canvas = document.createElement('canvas');
      return canvas.toDataURL('image/webp').startsWith('data:image/webp');
    })();

  let maxDimension: number = MAX_DIMENSION;
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
