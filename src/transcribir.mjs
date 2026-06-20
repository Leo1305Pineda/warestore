import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

const execPromise = promisify(exec);

// === CONFIGURACIÓN ===
const WHISPER_BIN = '/home/leo/Descargas/test/node_modules/nwhisper/cpp/whisper.cpp/build/bin/whisper-cli';
const MODEL_PATH = '/home/leo/Descargas/test/node_modules/nwhisper/cpp/whisper.cpp/models/ggml-medium.bin';
// ====================

const audioPath = process.argv[2];
if (!audioPath || !existsSync(audioPath)) {
  console.error('❌ Uso: node transcribir.mjs <ruta_del_audio>');
  process.exit(1);
}

// --- Verificar binario y modelo ---
if (!existsSync(WHISPER_BIN)) {
  console.error(`❌ Binario no encontrado: ${WHISPER_BIN}`);
  process.exit(1);
}
if (!existsSync(MODEL_PATH)) {
  console.error(`❌ Modelo no encontrado: ${MODEL_PATH}`);
  console.error('Descárgalo con: cd ~/Descargas/test/node_modules/nwhisper/cpp/whisper.cpp && ./models/download-ggml-model.sh large');
  process.exit(1);
}

// --- Determinar si necesita conversión ---
const ext = path.extname(audioPath).toLowerCase();
let wavPath = audioPath;          // por defecto, usar el mismo archivo
let tempWav = false;

if (ext !== '.wav') {
  // Generar nombre para WAV temporal
  const baseName = path.basename(audioPath, ext);
  const dirName = path.dirname(audioPath);
  wavPath = path.join(dirName, `${baseName}.wav`);
  tempWav = true;

  console.log(`🔄 Convirtiendo ${audioPath} a ${wavPath} ...`);
  try {
    await execPromise(`ffmpeg -i "${audioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`);
  } catch (err) {
    console.error('❌ Falló la conversión con ffmpeg:', err.stderr || err.message);
    process.exit(1);
  }
  if (!existsSync(wavPath)) {
    console.error('❌ No se pudo generar el archivo WAV.');
    process.exit(1);
  }
}

// --- Transcripción ---
try {
  console.log(`🔊 Transcribiendo: ${wavPath} ...`);
  const command = `${WHISPER_BIN} -m ${MODEL_PATH} -f "${wavPath}" -l es --output-txt`;
  const { stdout, stderr } = await execPromise(command);
  if (stderr) console.warn('⚠️', stderr);
  console.log('📝 Transcripción:');
  console.log(stdout);
} catch (error) {
  console.error('❌ Error:', error.stderr || error.message);
} finally {
  // Limpiar archivo temporal si se creó
  if (tempWav && existsSync(wavPath)) {
    unlinkSync(wavPath);
    console.log('🧹 Archivo WAV temporal eliminado.');
  }
}