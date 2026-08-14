import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, '../../');
const WHISPER_BINARY = path.join(ROOT, '.runtime', 'whisper.cpp', 'build', 'bin', 'whisper-cli');
const WHISPER_MODEL = path.join(ROOT, '.runtime', 'whisper.cpp', 'models', 'ggml-tiny.bin');

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(['res.cloudinary.com', 'cloudinary.com']);

function assertSupportedMediaUrl(mediaUrl: string): URL {
  let url: URL;
  try {
    url = new URL(mediaUrl);
  } catch {
    throw new Error('Invalid media URL');
  }

  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('Unsupported media host');
  }

  return url;
}

async function downloadAudio(mediaUrl: string, outputPath: string): Promise<void> {
  const url = assertSupportedMediaUrl(mediaUrl);
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Unable to download voice note (${response.status})`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_AUDIO_BYTES) {
    throw new Error('Voice note is too large to verify');
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of response.body as any) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_AUDIO_BYTES) {
      throw new Error('Voice note is too large to verify');
    }
    chunks.push(buffer);
  }

  await fs.writeFile(outputPath, Buffer.concat(chunks));
}

export async function transcribeVoiceNote(mediaUrl: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibe-voice-'));
  const sourcePath = path.join(tempDir, 'source-audio');
  const wavPath = path.join(tempDir, 'voice.wav');

  try {
    await downloadAudio(mediaUrl, sourcePath);

    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', sourcePath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      wavPath,
    ], { maxBuffer: 1024 * 1024 });

    const { stdout } = await execFileAsync(WHISPER_BINARY, [
      '-m', WHISPER_MODEL,
      '-f', wavPath,
      '-l', 'en',
      '-nt',
      '-np',
      '-ng',
    ], { maxBuffer: 2 * 1024 * 1024 });

    return stdout.replace(/\s+/g, ' ').trim();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function isWhisperConfigured(): boolean {
  return true;
}
