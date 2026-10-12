import imageCompression from 'browser-image-compression';

const MAX_UPLOAD_BYTES = 1.8 * 1024 * 1024;

const compress = (file: File, useWebWorker: boolean, maxSizeMB: number, initialQuality: number) =>
  imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight: 1600,
    useWebWorker,
    fileType: 'image/webp',
    initialQuality,
    alwaysKeepResolution: false,
  });

/**
 * Compress provider photos below the backend's 2 MB limit with some headroom.
 * Some mobile browsers cannot start the compression worker, so retry on the
 * main thread before failing the upload.
 */
export const compressToWebP = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose a valid image file (JPG, PNG, or WebP).');
  }

  let compressed: File;
  try {
    compressed = await compress(file, true, 1.7, 0.72);
  } catch (workerError) {
    try {
      compressed = await compress(file, false, 1.7, 0.65);
    } catch {
      throw new Error('This image could not be processed on your device. Try a JPG or PNG image, or choose a smaller photo.');
    }
  }

  if (compressed.size > MAX_UPLOAD_BYTES) {
    try {
      compressed = await compress(compressed, false, 1.5, 0.55);
    } catch {
      throw new Error('This photo is too large to upload after compression. Choose a smaller image.');
    }
  }

  if (!compressed.size || compressed.size > MAX_UPLOAD_BYTES) {
    throw new Error('This photo is still too large after compression. Choose a smaller image.');
  }

  if (compressed.type !== 'image/webp') {
    throw new Error('Your browser could not convert this photo to WebP. Try another image or browser.');
  }

  return compressed;
};
