import { API_BASE_URL } from '../../config';

export const uploadMedia = async (
  file: File | Blob,
  context: string,
  isLocked = false,
  onProgress?: (percent: number) => void
): Promise<{ url: string; publicId: string; duration?: number }> => {
  const formData = new FormData();
  formData.append('file',     file, (file as File).name || 'voice_note.webm');
  formData.append('context',  context);
  formData.append('isLocked', String(isLocked));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));

    const token = localStorage.getItem('adultAccessToken');
    xhr.open('POST', `${API_BASE_URL}/v1/adult/media/upload`);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.send(formData);
  });
};
