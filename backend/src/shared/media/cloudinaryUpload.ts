import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

// Config already exists — do not re-configure if already done
const existingConfig = cloudinary.config();
if (!existingConfig || !existingConfig.cloud_name) {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloudinary_url: process.env.CLOUDINARY_URL,
    });
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure:     true,
    });
  }
}

// ── QUALITY CONSTANT ───────────────────────────────────────────
// 0.4 for image/video uploads. Audio is delivered as M4A/AAC for
// reliable HTML5 playback, including iOS Safari.
export const QUALITY = 0.4;
export const IMAGE_QUALITY = Math.round(QUALITY * 100);   // 40
export const VIDEO_QUALITY = Math.round(QUALITY * 100);   // 40

// ── UPLOAD FOLDERS ────────────────────────────────────────────
export const FOLDERS = {
  profilePhoto:    'zippo/adult/profiles',
  onboardingPhoto: 'zippo/adult/onboarding/photos',
  onboardingVideo: 'zippo/adult/onboarding/videos',
  chatImage:       'zippo/adult/chat/images',
  chatVideo:       'zippo/adult/chat/videos',
  voiceNote:       'zippo/adult/chat/voice',
  paidMedia:       'zippo/adult/paid',
  camThumbnail:    'zippo/adult/cams',
  giftIcon:        'zippo/gifts',
};

interface UploadOptions {
  resourceType?: 'image' | 'video' | 'raw';
  folder?: string;
  isPrivate?: boolean;
  publicId?: string | null;
}

/**
 * Upload a buffer or stream to Cloudinary.
 *
 * Cloudinary treats audio as a video resource type. Voice notes are therefore
 * uploaded as video assets and delivered as M4A/AAC. This avoids depending on
 * the browser's recording container (WebM/Opus vs MP4/AAC) at playback time.
 */
export const uploadToCloudinary = (fileData: Buffer | Readable, options: UploadOptions = {}): Promise<any> => {
  return new Promise((resolve, reject) => {
    const {
      resourceType = 'image',
      folder       = FOLDERS.chatImage,
      isPrivate    = false,
      publicId     = null,
    } = options;

    const isVoiceNote = folder === FOLDERS.voiceNote;
    const effectiveResourceType = isVoiceNote ? 'video' : resourceType;

    const uploadOptions: any = {
      folder,
      resource_type: effectiveResourceType,
      quality: effectiveResourceType === 'video' ? VIDEO_QUALITY : effectiveResourceType === 'image' ? IMAGE_QUALITY : undefined,
      type: isPrivate ? 'authenticated' : 'upload',
      format: effectiveResourceType === 'image' ? 'webp' : undefined,
      flags: effectiveResourceType === 'image' ? 'progressive' : undefined,
    };

    if (publicId) uploadOptions.public_id = publicId;

    // Match the aggressive image optimization used throughout the provider media pipeline.
    if (effectiveResourceType === 'image') {
      uploadOptions.transformation = [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto:low', fetch_format: 'webp' },
        { quality: IMAGE_QUALITY },
      ];
    }

    // For video: compress and optimize. Audio uses the same resource type,
    // but its delivery URL is explicitly converted to M4A below.
    if (effectiveResourceType === 'video') {
      uploadOptions.transformation = [
        { quality: VIDEO_QUALITY },
        { video_codec: 'auto' },
      ];
      uploadOptions.eager_async = true;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Upload to Cloudinary returned undefined result'));

        const deliveryUrl = isVoiceNote
          ? cloudinary.url(result.public_id, {
              resource_type: 'video',
              type: isPrivate ? 'authenticated' : 'upload',
              secure: true,
              format: 'm4a',
            })
          : result.secure_url;

        resolve({
          publicId:    result.public_id,
          url:         deliveryUrl,
          format:      isVoiceNote ? 'm4a' : result.format,
          bytes:       result.bytes,
          width:       result.width,
          height:      result.height,
          duration:    result.duration,
          resourceType: result.resource_type,
        });
      }
    );

    if (Buffer.isBuffer(fileData)) {
      Readable.from(fileData).pipe(uploadStream);
    } else {
      fileData.pipe(uploadStream);
    }
  });
};

/**
 * Delete a file from Cloudinary
 */
export const deleteFromCloudinary = async (publicId: string, resourceType = 'image') => {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

/**
 * Generate a signed URL for private/paid media
 * (authenticated type — requires signature for access)
 */
export const getSignedUrl = (publicId: string, expiresInSeconds = 3600) => {
  return cloudinary.url(publicId, {
    type:      'authenticated',
    sign_url:  true,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    secure:    true,
  });
};
