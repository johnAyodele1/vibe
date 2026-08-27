import React, { useState } from 'react';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';
import { compressToWebP } from '../../lib/media/compressImage';
import { uploadMedia } from '../../lib/media/uploadMedia';

interface ProviderProfilePhotosProps {
  photos: string[];
  setPhotos: React.Dispatch<React.SetStateAction<string[]>>;
}

const ProviderProfilePhotos: React.FC<ProviderProfilePhotosProps> = ({ photos, setPhotos }) => {
  const token = localStorage.getItem('adultAccessToken');
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (photos.length >= 5) {
      toast.error('Maximum 5 photos allowed');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error(`${file.name} is not an image`);
      return;
    }

    setCompressing(true);
    setUploading(true);
    try {
      const webpFile = await compressToWebP(file);
      setCompressing(false);

      const result = await uploadMedia(webpFile, 'onboarding_photo');
      setPhotos(prev => [...prev, result.url]);
      toast.success('Photo uploaded and optimized successfully');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Photo upload failed';
      toast.error(errMsg);
      setCompressing(false);
    } finally {
      setUploading(false);
    }
  };

  const handleSavePhotos = async () => {
    if (photos.length === 0) {
      toast.error('Please upload at least one photo before saving');
      return;
    }

    if (!token) {
      toast.error('Your session has expired. Please sign in again.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/photos`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ photos })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        const message = typeof data?.error === 'string'
          ? data.error
          : data?.error?.message || data?.message || 'Failed to update photos';
        throw new Error(message);
      }
      toast.success('Profile photos updated successfully');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update photos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-3xl font-serif italic text-white mb-2">Showcase Yourself</h3>
        <p className="text-sm text-[var(--az-text-secondary)]">Upload gorgeous visual media. The first image is your primary profile image.</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-4">Photos (Up to 5)</label>

          {compressing && (
            <div className="upload-zone__compressing mb-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="upload-zone__compress-bar">
                <div className="upload-zone__compress-fill" />
              </div>
              <p className="text-xs font-serif italic mt-2">Optimising image... 🪄</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {photos.map((ph, idx) => (
              <div key={`${ph}-${idx}`} className="aspect-square bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl overflow-hidden relative group">
                <img src={ph} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                  disabled={saving || uploading}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black text-white text-xs flex items-center justify-center transition-colors disabled:opacity-50"
                  aria-label={`Remove photo ${idx + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}

            {uploading && !compressing && (
              <div className="aspect-square bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl flex flex-col items-center justify-center">
                <div className="w-6 h-6 border-2 border-[var(--az-accent-rose)] border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] uppercase font-bold text-[var(--az-text-secondary)] mt-2">Uploading...</span>
              </div>
            )}

            {photos.length < 5 && !uploading && (
              <label className="aspect-square bg-[var(--az-bg-tertiary)] border-2 border-dashed border-var(--az-border) hover:border-[var(--az-accent-rose)] rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all">
                <span className="text-2xl text-[var(--az-text-secondary)]">+</span>
                <span className="text-[10px] uppercase font-bold text-[var(--az-text-secondary)] mt-1">Upload</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoUpload} disabled={uploading || saving} />
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSavePhotos}
          disabled={saving || uploading || compressing || photos.length === 0}
          className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
        >
          {saving ? 'Processing...' : 'Save Photos'}
        </button>
      </div>
    </div>
  );
};

export default ProviderProfilePhotos;
