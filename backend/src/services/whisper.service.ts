import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, '../../');
const WHISPER_BINARY = path.join(ROOT, '.runtime', 'whisper.cpp', 'build', 'bin', 'whisper-cli');
const WHISPER_MODEL = path.join(ROOT, '.runtime', 'whisper.cpp', 'models', 'ggml-tiny-q5_1.bin');

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
let transcriptionQueue = Promise.resolve();

async function transcribeVoiceBufferInternal(audioBuffer: Buffer): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibe-voice-'));
  const sourcePath = path.join(tempDir, 'source-audio');
  const wavPath = path.join(tempDir, 'voice.wav');

  try {
    await fs.writeFile(sourcePath, audioBuffer);

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
      '-t', '1',
      '-nt',
      '-np',
      '-ng',
    ], { maxBuffer: 2 * 1024 * 1024 });

    return stdout.replace(/\s+/g, ' ').trim();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function transcribeVoiceBuffer(audioBuffer: Buffer): Promise<string> {
  if (!audioBuffer.length || audioBuffer.length > MAX_AUDIO_BYTES) {
    return Promise.reject(new Error('Voice note is too large to verify'));
  }

  const job = transcriptionQueue.then(() => transcribeVoiceBufferInternal(audioBuffer));
  transcriptionQueue = job.then(() => undefined, () => undefined);
  return job;
}
