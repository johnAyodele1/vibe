import QRCode from 'qrcode';
import { uploadToCloudinary } from './media/cloudinaryUpload';

/**
 * Generate a standards-compliant QR code using the maintained `qrcode`
 * implementation. Ticket URLs can span multiple QR versions, so this must
 * not use a hand-rolled single Reed-Solomon block implementation.
 */
export const generateQRCode = async (data: string): Promise<string> => {
  const pngBuffer = await QRCode.toBuffer(data, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    scale: 8,
  });

  try {
    const result = await uploadToCloudinary(pngBuffer, {
      folder: 'zippo/tickets/qr',
      resourceType: 'image',
      isPrivate: false,
    });

    if (result?.url) return result.url;
  } catch {
    // Keep ticket creation resilient when QR asset storage is unavailable.
  }

  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
};
