const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WHISPER_VERSION = 'v1.9.1';
const ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(ROOT, '.runtime', 'whisper.cpp');
const MODEL_DIR = path.join(RUNTIME_DIR, 'models');
const BINARY = path.join(RUNTIME_DIR, 'build', 'bin', 'whisper-cli');
const MODEL = path.join(MODEL_DIR, 'ggml-tiny.bin');

function commandExists(command) {
  try {
    execFileSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function main() {
  if (!commandExists('git')) throw new Error('git is required to build whisper.cpp');
  if (!commandExists('cmake')) throw new Error('cmake is required to build whisper.cpp');
  if (!commandExists('ffmpeg')) throw new Error('ffmpeg is required for voice-note format conversion');

  fs.mkdirSync(path.dirname(RUNTIME_DIR), { recursive: true });

  if (!fs.existsSync(BINARY)) {
    if (!fs.existsSync(path.join(RUNTIME_DIR, '.git'))) {
      fs.rmSync(RUNTIME_DIR, { recursive: true, force: true });
      run('git', [
        'clone',
        '--depth', '1',
        '--branch', WHISPER_VERSION,
        'https://github.com/ggml-org/whisper.cpp.git',
        RUNTIME_DIR,
      ]);
    }

    run('cmake', [
      '-S', RUNTIME_DIR,
      '-B', path.join(RUNTIME_DIR, 'build'),
      '-DCMAKE_BUILD_TYPE=Release',
      '-DWHISPER_BUILD_TESTS=OFF',
      '-DWHISPER_BUILD_SERVER=OFF',
    ]);

    run('cmake', [
      '--build', path.join(RUNTIME_DIR, 'build'),
      '--config', 'Release',
      '--target', 'whisper-cli',
      '--', '-j2',
    ]);
  }

  if (!fs.existsSync(MODEL)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
    run('sh', [
      path.join(RUNTIME_DIR, 'models', 'download-ggml-model.sh'),
      'tiny',
    ], { cwd: RUNTIME_DIR });
  }

  console.log(`whisper.cpp ready: ${BINARY}`);
  console.log(`Whisper tiny model ready: ${MODEL}`);
}

main();
