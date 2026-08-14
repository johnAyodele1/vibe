import { API_BASE_URL } from '../../config';

export const uploadMedia = async (
  file: File | Blob,
  context: string,
  isLocked = false,
  onProgress?: (percent: number) => void
): Promise<{ url: string; publicId: string; duration?: number }> => {
  const formData = new FormData();
  formData.append('file', file, (file as File).name || 'voice_note.webm');
  formData.append('context', context);
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
        try {
          const response = JSON.parse(xhr.responseText) as {
            url: string;
            publicUrl?: string;
            publicId?: string;
            duration?: number;
          };

          // Regular chat media is uploaded as a public Cloudinary asset. Do not
          // persist its public_id into AdultMessage: the message read path uses
          // that field to generate authenticated URLs, which breaks public
          // images after a reload. Paid/locked media keeps its public_id so it
          // can continue using signed access.
          const isPrivateMedia = isLocked || context === 'paid_image' || context === 'paid_video';

          resolve({
            url: response.url || response.publicUrl || '',
            publicId: isPrivateMedia ? (response.publicId || '') : '',
            duration: response.duration,
          });
        } catch {
          reject(new Error('Invalid upload response'));
        }
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
