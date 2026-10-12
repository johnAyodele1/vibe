import { API_BASE_URL } from '../../config';

type UploadResponse = {
  url?: unknown;
  publicUrl?: unknown;
  publicId?: unknown;
  duration?: unknown;
  error?: unknown;
  message?: unknown;
  success?: unknown;
};

const getServerMessage = (body: UploadResponse | null): string | undefined => {
  if (!body) return undefined;
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  if (typeof body.error === 'string' && body.error.trim()) return body.error;
  if (body.error && typeof body.error === 'object') {
    const nested = body.error as { message?: unknown; code?: unknown };
    if (typeof nested.message === 'string' && nested.message.trim()) return nested.message;
    if (typeof nested.code === 'string' && nested.code.trim()) return nested.code;
  }
  return undefined;
};

const messageForStatus = (status: number): string => {
  if (status === 400) return 'The image could not be accepted. Choose a JPG, PNG, or WebP image and try again.';
  if (status === 401 || status === 403) return 'Your session has expired. Sign in again, then retry the upload.';
  if (status === 413) return 'This image is too large for the server. Choose a smaller photo and try again.';
  if (status === 429) return 'Too many upload attempts. Wait a moment and try again.';
  if (status >= 500) return 'The upload service is temporarily unavailable. Please try again shortly.';
  return `Upload failed (HTTP ${status}). Please try again.`;
};

export const uploadMedia = async (
  file: File | Blob,
  context: string,
  isLocked = false,
  onProgress?: (percent: number) => void
): Promise<{ url: string; publicId: string; duration?: number }> => {
  if (!file.size) throw new Error('The selected file is empty. Choose another file.');
  if (file.size > 2 * 1024 * 1024 && (context === 'profile_photo' || context === 'onboarding_photo' || context === 'chat_image' || context === 'paid_image' || context === 'cam_thumbnail' || context === 'party_photo')) {
    throw new Error('This image is larger than the 2 MB upload limit. Choose a smaller photo.');
  }

  const formData = new FormData();
  const filename = file instanceof File && file.name ? file.name : 'upload.bin';
  formData.append('file', file, filename);
  formData.append('context', context);
  formData.append('isLocked', String(isLocked));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = 60_000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let body: UploadResponse | null = null;
      try {
        const parsed: unknown = JSON.parse(xhr.responseText);
        if (parsed && typeof parsed === 'object') body = parsed as UploadResponse;
      } catch {
        // Proxies and framework error handlers sometimes return non-JSON bodies.
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const url = body?.url || body?.publicUrl;
        if (typeof url !== 'string' || !url.trim()) {
          reject(new Error('The upload service responded without an image URL. Please retry. If this keeps happening, contact support.'));
          return;
        }

        const isPrivateMedia = isLocked || context === 'paid_image' || context === 'paid_video';
        resolve({
          url,
          publicId: isPrivateMedia && typeof body?.publicId === 'string' ? body.publicId : '',
          duration: typeof body?.duration === 'number' ? body.duration : undefined,
        });
        return;
      }

      reject(new Error(getServerMessage(body) || messageForStatus(xhr.status)));
    };

    xhr.onerror = () => reject(new Error('Could not reach the upload service. Check your internet connection and try again.'));
    xhr.ontimeout = () => reject(new Error('The upload took too long. Check your connection and retry with a smaller photo.'));
    xhr.onabort = () => reject(new Error('The upload was cancelled. Please try again.'));

    const token = localStorage.getItem('adultAccessToken');
    xhr.open('POST', `${API_BASE_URL}/v1/adult/media/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
};
