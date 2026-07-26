import imageCompression from 'browser-image-compression';

export const compressToWebP = async (file: File): Promise<File> => {
  // First: compress with browser-image-compression
  const compressed = await imageCompression(file, {
    maxSizeMB:         2,              // 2MB limit
    maxWidthOrHeight:  1920,           // max dimension
    useWebWorker:      true,           // non-blocking
    fileType:          'image/webp',   // convert to WebP
    initialQuality:    0.5,            // 50% quality
    alwaysKeepResolution: false,
  });

  // If still over 2MB (rare), compress again with lower quality
  if (compressed.size > 2 * 1024 * 1024) {
    return imageCompression(compressed, {
      maxSizeMB:      1.9,
      useWebWorker:   true,
      fileType:       'image/webp',
      initialQuality: 0.4,
    });
  }

  return compressed;
};
