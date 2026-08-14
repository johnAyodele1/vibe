import { Request, Response } from 'express';
import { detectContactSharing } from '@yourapp/content-filter';
import { uploadMedia as uploadMediaToCloudinary } from './providerOnboarding.controller';
import { FOLDERS, uploadToCloudinary } from '../shared/media/cloudinaryUpload';
import { transcribeVoiceBuffer } from '../services/whisper.service';

const VOICE_NOTE_MAX_BYTES = 5 * 1024 * 1024;

export const uploadMediaWithVoiceVerification = async (req: Request, res: Response) => {
  if (req.body.context !== 'voice_note') {
    return uploadMediaToCloudinary(req, res);
  }

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file provided' });

  if (file.size > VOICE_NOTE_MAX_BYTES) {
    return res.status(413).json({ error: 'File too large. Maximum: 5MB' });
  }

  let transcript: string;
  try {
    transcript = await transcribeVoiceBuffer(file.buffer);
  } catch (error) {
    console.error('Voice transcription failed:', error);
    return res.status(503).json({
      error: 'Voice note could not be verified. Please try again.',
      code: 'VOICE_VERIFICATION_UNAVAILABLE',
    });
  }

  if (!transcript) {
    return res.status(422).json({
      error: 'Voice note could not be verified because no speech was detected.',
      code: 'VOICE_TRANSCRIPT_EMPTY',
    });
  }

  const check = detectContactSharing(transcript);
  if (check.detected) {
    return res.status(400).json({
      error: 'Voice note blocked because it contains contact information.',
      code: 'CONTACT_INFORMATION_DETECTED',
      category: check.category,
    });
  }

  try {
    const result = await uploadToCloudinary(file.buffer, {
      resourceType: 'video',
      folder: FOLDERS.voiceNote,
      isPrivate: false,
    });

    return res.json({
      url: result.url,
      publicUrl: result.url,
      publicId: result.publicId,
      format: result.format,
      bytes: result.bytes,
      duration: result.duration,
      width: result.width,
      height: result.height,
      isPrivate: false,
      transcript,
    });
  } catch (error) {
    console.error('Cloudinary voice upload error:', error);
    return res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
};
