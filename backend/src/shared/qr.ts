import { uploadToCloudinary } from './media/cloudinaryUpload';

export const generateQRCode = async (data: string): Promise<string> => {
  const encodedData = encodeURIComponent(data);
  const qrServerUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodedData}&color=0a0608&bgcolor=f5edf0`;

  try {
    const response = await fetch(qrServerUrl);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await uploadToCloudinary(buffer, {
        folder: 'zippo/tickets/qr',
        resourceType: 'image',
        isPrivate: false,
      });
      if (result && result.url) {
        return result.url;
      }
    }
  } catch (err) {
    console.warn('Cloudinary upload for QR code fallback to public QR server:', err);
  }

  return qrServerUrl;
};
