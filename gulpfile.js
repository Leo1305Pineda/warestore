const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const through2 = require('through2');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const fsPromises = fs.promises;
const shell = require('gulp-shell');
// Configuración
const WHISPER_BIN = path.join(__dirname, '/node_modules/nwhisper/cpp/whisper.cpp/build/bin/whisper-cli');
const MODEL_PATH = path.join(__dirname, '/node_modules/nwhisper/cpp/whisper.cpp/models/ggml-medium.bin');
const TMP_DIR = path.join(__dirname, 'tmp');        // directorio donde buscar .opus
const DIST_DIR = path.join(__dirname, 'dist');        // directorio donde buscar .opus

// Validar dependencias
function validateDependencies() {
    if (!fs.existsSync(WHISPER_BIN)) {
        throw new Error(`❌ Binario no encontrado: ${WHISPER_BIN}`);
    }
    if (!fs.existsSync(MODEL_PATH)) {
        throw new Error(`❌ Modelo no encontrado: ${MODEL_PATH}`);
    }
    if (!fs.existsSync(TMP_DIR)) {
        throw new Error(`❌ Directorio tmp no existe: ${TMP_DIR}`);
    }
}

// === Función recursiva para encontrar .opus ===
async function findFiles(dir, ext) {
    const results = [];
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const subResults = await findFiles(fullPath, ext);
            results.push(...subResults);
        } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ext) {
            results.push(fullPath);
        }
    }
    return results;
}

gulp.task('covert-wav-txt', async function (done) {
    try {
        validateDependencies();

        // Buscar recursivamente todos los .wav
        const paths = await findFiles(TMP_DIR, '.wav');

        if (paths.length === 0) {
            console.log('⚠️ No se encontraron archivos .wav en tmp/ (ni en subcarpetas).');
            return done();
        }

        console.log(`📁 Encontrados ${paths.length} archivos .wav en total.`);

        for (const wavPath of paths) {
            console.log(`🔄 Procesando ${wavPath} ...`);

            // Whisper genera automáticamente <nombre>.wav.txt en el mismo directorio
            const command = `${WHISPER_BIN} -m ${MODEL_PATH} -f "${wavPath}" -l es --output-txt`;

            try {
                const { stdout, stderr } = await execPromise(command);
                if (stderr) console.warn('⚠️', stderr);

                // Whisper ya creó el archivo, no hacemos nada más
                const baseName = path.basename(wavPath, '.wav');
                const dirName = path.dirname(wavPath);
                const generatedTxt = path.join(dirName, `${baseName}.wav.txt`);

                if (fs.existsSync(generatedTxt)) {
                    console.log(`✅ Transcripción guardada en ${generatedTxt}`);
                } else {
                    console.warn(`⚠️ No se generó el archivo esperado: ${generatedTxt}`);
                }
            } catch (err) {
                console.error(`❌ Error transcribiendo ${wavPath}:`, err.stderr || err.message);
                // Continuamos con el siguiente archivo
            }
        }

        console.log('🎉 Todos los archivos .wav procesados.');
        done();
    } catch (err) {
        console.error('❌ Error en la tarea:', err.message);
        done(err);
    }
});

gulp.task('covert-opus-wav', async function (done) {
    try {
        validateDependencies();

        // Buscar recursivamente todos los .opus
        const paths = await findFiles(TMP_DIR, '.opus');

        if (paths.length === 0) {
            console.log('⚠️ No se encontraron archivos .opus en tmp/ (ni en subcarpetas).');
            return done();
        }

        console.log(`📁 Encontrados ${paths.length} archivos .opus en total.`);

        for (const base of paths) {
            const baseName = path.basename(base, '.opus');

            const output_path = base.replace(baseName + '.opus', '');

            // Convertir a WAV en tmp (con nombre temporal)
            const wavPath = path.join(output_path, `${baseName}.wav`);

            // Salta si ya existe
            if (fs.existsSync(wavPath)) {
                continue;
            }

            try {
                await execPromise(`ffmpeg -i "${path}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`);
                console.log(`🔄 Procesando ${path} ...`);
            } catch (err) {
                console.error(`❌ Falló conversión de ${path}:`);
                if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
                continue;
            }
        }

        console.log('🎉 Todos los archivos .opus procesados.');
        done();
    } catch (err) {
        console.error('❌ Error en la tarea:', err.message);
        done(err);
    }
});


gulp.task('unzip-all', function (done) {
    const sourceDir = path.join(__dirname, 'zips');   // Directorio donde están los .zip
    const targetDir = path.join(__dirname, 'tmp');    // Directorio destino

    // Crear el directorio tmp si no existe
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Leer archivos del sourceDir
    fs.readdir(sourceDir, (err, files) => {
        if (err) {
            console.error('❌ Error al leer directorio:', err.message);
            return done(err);
        }

        const zipFiles = files.filter(f => path.extname(f).toLowerCase() === '.zip');

        if (zipFiles.length === 0) {
            console.log('⚠️ No se encontraron archivos .zip en', sourceDir);
            return done();
        }

        console.log(`📦 Encontrados ${zipFiles.length} archivos zip. Descomprimiendo...`);

        zipFiles.forEach((zipFile) => {
            const zipPath = path.join(sourceDir, zipFile);
            const zip = new AdmZip(zipPath);
            // Extraer en una subcarpeta con el nombre del zip (sin extensión) dentro de tmp
            const zipName = path.basename(zipFile, '.zip');
            const extractPath = path.join(targetDir, zipName);

            // Crear la carpeta de extracción
            if (!fs.existsSync(extractPath)) {
                fs.mkdirSync(extractPath, { recursive: true });
            }

            // Extraer todo manteniendo estructura
            zip.extractAllTo(extractPath, true); // true = overwrite
            console.log(`   ✔️  ${zipFile} → ${extractPath}`);
        });

        console.log(`🎉 Todos los zip descomprimidos en ${targetDir}`);
        done();
    });
});

// Tarea 2: Limpiar directorio (ejemplo)
gulp.task('clean-tmp', function (done) {
    const distPath = path.join(__dirname, 'tmp');
    fs.rm(distPath, { recursive: true, force: true }, (err) => {
        if (err) {
            console.error('❌ Error al eliminar dist:', err.message);
            return done(err);
        }
        console.log('🗑️ Directorio dist eliminado correctamente.');
        done();
    });
});

function cleanFileName(fileName) {
    if (!fileName) return '';

    // Eliminar caracteres invisibles Unicode
    let clean = fileName.replace(/[\u200E\u200F\u202A-\u202E]/g, '');

    // Eliminar espacios extra al inicio/final
    clean = clean.trim();

    // Reemplazar espacios por _ para evitar problemas en URLs
    clean = clean.replace(/\s+/g, '_');

    // Eliminar caracteres especiales que puedan causar problemas
    clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');

    return clean;
}

gulp.task('list-tmp-files', async function (done) {
    try {
        const tmpDir = TMP_DIR;
        const entries = await fs.promises.readdir(tmpDir, { withFileTypes: true });
        const subdirs = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);

        for (const dir of subdirs) {
            const dirPath = path.join(tmpDir, dir);
            console.log(`\n📂 ${dir}:`);
            const files = await fs.promises.readdir(dirPath);
            for (const file of files) {
                const clean = cleanFileName(file);
                console.log(`  ${file} → ${clean}`);
            }
        }
        done();
    } catch (err) {
        console.error('❌ Error:', err.message);
        done(err);
    }
});

gulp.task('copy-assets', async function (done) {
    try {
        console.log('📦 Copiando assets a dist/...');

        const tmpDir = TMP_DIR;
        const entries = await fs.promises.readdir(tmpDir, { withFileTypes: true });
        const subdirs = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(name => !name.startsWith('.'));

        if (subdirs.length === 0) {
            console.log('⚠️  No hay subdirectorios en tmp/ para procesar.');
            return done();
        }

        for (const dir of subdirs) {
            const rutaOrigen = path.join(tmpDir, dir);
            const landing = path.join(DIST_DIR, dir); // ← Esto es dist/[nombre-carpeta]
            const jsonPath = path.join(landing, 'data.json');

            // Verificar si existe el JSON
            try {
                await fs.promises.access(jsonPath, fs.constants.F_OK);
            } catch (_) {
                console.warn(`⚠️  No se encontró ${jsonPath}, saltando ${dir}`);
                continue;
            }

            console.log(`\n📂 Procesando assets para: ${dir}`);
            console.log(`   Origen: ${rutaOrigen}`);
            console.log(`   Destino: ${landing}`);

            // Cargar el JSON
            const content = await fs.promises.readFile(jsonPath, 'utf8');
            const messages = JSON.parse(content);

            // Copiar assets a dist/[dir]/assets/
            const updatedMessages = await copyAssetsToDist(messages, rutaOrigen, landing);

            // Guardar JSON con rutas actualizadas
            await fs.promises.writeFile(jsonPath, JSON.stringify(updatedMessages, null, 2), 'utf8');
            console.log(`✅ JSON actualizado en ${jsonPath}`);
        }

        console.log('\n🎉 Todos los assets copiados correctamente.');
        done();
    } catch (err) {
        console.error('❌ Error en copy-assets:', err.message);
        done(err);
    }
});

// Tarea 3: Copiar archivos (ejemplo)
gulp.task('copy', function () {
    console.log('📦 Copiando imágenes y PDFs desde tmp a dist/[nombre-carpeta]/assets...');
    return gulp.src('./tmp/**/*.{jpg,jpeg,png,gif,svg,webp,pdf}')
        .pipe(gulp.dest(function (file) {
            // file.relative es la ruta relativa desde la base de src (./tmp)
            // Ejemplo: 'landing1/subcarpeta/foto.jpg'
            const relativePath = file.relative;

            // Dividimos la ruta en partes
            const parts = relativePath.split(path.sep);

            // El primer segmento es el nombre de la carpeta de la landing
            const landingFolder = parts[0];

            // El resto (subcarpetas + nombre del archivo) se mantiene dentro de assets
            const rest = parts.slice(1).join(path.sep);

            // Construimos la ruta final: dist/[landingFolder]/assets/[rest]
            return path.join('dist', landingFolder, 'assets', rest);
        }));
});

/**
 * Parsea un archivo de chat de WhatsApp (formato exportado) a JSON.
 * @param {string} nombreArchivo - Ej: 'chat.txt'
 * @param {string} rutaDirectorio - Ej: './data' o __dirname
 * @returns {Promise<Array>} - Array de objetos con fecha, usuario, mensaje, esAdjunto
 */
async function parseChatToJson(nombreArchivo, rutaDirectorio) {
    const rutaCompleta = path.join(rutaDirectorio, nombreArchivo);

    // Leer el archivo usando fs.promises (disponible sin cambiar el require)
    const contenido = await fs.promises.readFile(rutaCompleta, 'utf8');

    // Dividir en líneas (maneja \r\n)
    const lineas = contenido.split(/\r?\n/);

    const resultados = [];

    for (const linea of lineas) {
        const lineaTrim = linea.trim();
        if (lineaTrim === '') continue;

        // ------------------------------------------------------------
        // 1. Separar fecha del resto usando el primer " - "
        // ------------------------------------------------------------
        const idxSep = lineaTrim.indexOf(' - ');
        if (idxSep === -1) {
            // Si no hay separador, la línea no es válida → la omitimos
            continue;
        }

        const fecha = lineaTrim.substring(0, idxSep).trim();
        let resto = lineaTrim.substring(idxSep + 3).trim(); // 3 = longitud de ' - '

        // ------------------------------------------------------------
        // 2. Eliminar caracteres especiales de formato (⁨, ⁩, @, etc.)
        // ------------------------------------------------------------
        resto = resto.replace(/[\u2068\u2069]/g, '').trim();

        let usuario = null;
        let mensaje = '';
        let esAdjunto = false;

        // ------------------------------------------------------------
        // 3. Buscar el primer ": " para separar usuario y mensaje
        // ------------------------------------------------------------
        const idxDosPuntos = resto.indexOf(': ');
        if (idxDosPuntos !== -1) {
            // Tiene formato "Usuario: mensaje"
            usuario = resto.substring(0, idxDosPuntos).trim();
            mensaje = resto.substring(idxDosPuntos + 2).trim(); // 2 = ': '
        } else {
            // No tiene ":" → es mensaje de sistema o acción
            usuario = 'Sistema';
            mensaje = resto;
        }

        // ------------------------------------------------------------
        // 4. Detectar si es un archivo adjunto
        // ------------------------------------------------------------
        if (mensaje.includes('(archivo adjunto)')) {
            esAdjunto = true;
        }

        resultados.push({
            fecha: fecha,
            usuario: usuario,
            mensaje: mensaje,
            esAdjunto: esAdjunto
        });
    }

    return resultados;
}

// Convierte .opus → .wav (solo si el .wav no existe o está vacío)
async function convertOpusToWav(opusPath) {
    const wavPath = opusPath.replace(/\.opus$/, '.wav');
    // Verificar si ya existe y tiene tamaño > 0
    try {
        const stats = await fs.promises.stat(wavPath);
        if (stats.size > 0) {
            console.log(`⏭️  WAV ya existe: ${wavPath}`);
            return wavPath;
        }
    } catch (_) {
        // No existe, se procede a convertir
    }

    console.log(`🔄 Convirtiendo ${opusPath} → ${wavPath}`);
    const cmd = `ffmpeg -i "${opusPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`;
    try {
        await execPromise(cmd);
        // Verificar que se generó
        const stats = await fs.promises.stat(wavPath);
        if (stats.size === 0) throw new Error('WAV generado vacío');
        return wavPath;
    } catch (err) {
        // Limpiar posible archivo corrupto
        try { await fs.promises.unlink(wavPath); } catch (_) { }
        throw new Error(`Error en conversión: ${err.message}`);
    }
}

// Transcribe .wav → .txt (genera .wav.txt) usando Whisper
async function transcribeWavToTxt(wavPath) {
    const txtPath = wavPath + '.txt';
    try {
        const stats = await fs.promises.stat(txtPath);
        if (stats.size > 0) {
            console.log(`⏭️  TXT ya existe: ${txtPath}`);
            const content = await fs.promises.readFile(txtPath, 'utf8');
            return content.trim();
        }
    } catch (_) {
        // No existe o está vacío
    }

    console.log(`🔄 Transcribiendo ${wavPath} → ${txtPath}`);
    const command = `${WHISPER_BIN} -m ${MODEL_PATH} -f "${wavPath}" -l es --output-txt`;
    try {
        await execPromise(command);
        const stats = await fs.promises.stat(txtPath);
        if (stats.size === 0) throw new Error('TXT generado vacío');
        const content = await fs.promises.readFile(txtPath, 'utf8');
        return content.trim();
    } catch (err) {
        // No eliminamos el txt por si quedó algo
        throw new Error(`Error en transcripción: ${err.message}`);
    }
}

// ------------------------------------------------------------
// PARSEADOR DE CHAT (igual que antes, pero lo dejamos como función separada)
// ------------------------------------------------------------
async function parseChatToJson(nombreArchivo, rutaDirectorio) {
    const rutaCompleta = path.join(rutaDirectorio, nombreArchivo);
    const contenido = await fs.promises.readFile(rutaCompleta, 'utf8');
    const lineas = contenido.split(/\r?\n/);
    const resultados = [];

    for (const linea of lineas) {
        const lineaTrim = linea.trim();
        if (lineaTrim === '') continue;

        const idxSep = lineaTrim.indexOf(' - ');
        if (idxSep === -1) continue;

        const fecha = lineaTrim.substring(0, idxSep).trim();
        let resto = lineaTrim.substring(idxSep + 3).trim();
        resto = resto.replace(/[\u2068\u2069]/g, '').trim();

        let usuario = null;
        let mensaje = '';
        let esAdjunto = false;

        const idxDosPuntos = resto.indexOf(': ');
        if (idxDosPuntos !== -1) {
            usuario = resto.substring(0, idxDosPuntos).trim();
            mensaje = resto.substring(idxDosPuntos + 2).trim();
        } else {
            usuario = 'Sistema';
            mensaje = resto;
        }

        if (mensaje.includes('(archivo adjunto)')) {
            esAdjunto = true;
        }

        resultados.push({ fecha, usuario, mensaje, esAdjunto });
    }

    return resultados;
}

// ------------------------------------------------------------
// PROCESADOR DE DIRECTORIO (integrado con transcripciones)
// ------------------------------------------------------------
async function procesarDirectorio(dir, rutaCompleta) {
    const json = `data.json`;
    const chatFile = path.join(rutaCompleta, dir + '.txt');
    const landing = path.join(DIST_DIR, dir);

    console.log(`\n▶️  Procesando directorio: ${dir} en ${landing}`);

    let messages;
    let modified = false;
    let jsonPath = path.join(landing, json);

    // 1. Cargar datos existentes o parsear
    try {
        // Intentar cargar JSON enriquecido
        await fs.promises.access(jsonPath, fs.constants.F_OK);
        const content = await fs.promises.readFile(jsonPath, 'utf8');
        messages = JSON.parse(content);
        console.log(`📄 Cargado JSON enriquecido existente en ${jsonPath}`);
        // Verificar si alguna nota de voz ya tiene transcripción para evitar reprocesar
        const hasTranscriptions = messages.some(m => m.esNotaVoz && m.transcripcion);
        if (hasTranscriptions) {
            console.log(`ℹ️  El JSON ya contiene transcripciones, se reanudará desde donde quedó.`);
        }
    } catch (_) {
        // No existe JSON, parsear desde chat.txt
        try {
            await fs.promises.access(chatFile, fs.constants.F_OK);
            messages = await parseChatToJson(dir + '.txt', rutaCompleta);
            console.log(`📄 Parseado chat.txt: ${messages.length} mensajes`);
            // Crear el directorio landing si no existe
            await fs.promises.mkdir(landing, { recursive: true });
        } catch (err) {
            console.warn(`⚠️  No se encontró ${dir}.txt en ${rutaCompleta}, se omite.`);
            return;
        }
    }

    // 2. Procesar notas de voz (solo las que no tienen transcripción)
    const opusRegex = /([^\s]+\.opus)/i;
    let algunaProcesada = false;

    for (const msg of messages) {
        // Saltar si no es adjunto o no es .opus
        if (!msg.esAdjunto) continue;
        const match = msg.mensaje.match(opusRegex);
        if (!match) continue;

        // Si ya tiene transcripción, saltamos (ya está procesada)
        if (msg.transcripcion) {
            continue;
        }

        const fileName = match[1].replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
        console.log(`🔍 Buscando archivo ${fileName} en ${rutaCompleta}`);

        const opusPath = path.join(rutaCompleta, fileName);
        if (!fs.existsSync(opusPath)) {
            console.warn(`⚠️  No se encontró ${opusPath}`);
            continue;
        }

        try {
            // Convertir y transcribir
            const wavPath = await convertOpusToWav(opusPath);
            const transcripcion = await transcribeWavToTxt(wavPath);

            // Enriquecer el mensaje
            msg.esNotaVoz = true;
            msg.transcripcion = transcripcion;
            msg.rutaOpus = opusPath.replace(TMP_DIR, '');
            msg.rutaWav = wavPath.replace(TMP_DIR, '');
            msg.rutaTxt = String(wavPath + '.txt').replace(TMP_DIR, '');
            modified = true;
            algunaProcesada = true;

            console.log(`✅ Nota de voz procesada: ${fileName}`);

            // 📌 GUARDAR DESPUÉS DE CADA NOTA (incremental)
            await fs.promises.writeFile(jsonPath, JSON.stringify(messages), 'utf8');
            console.log(`💾 Progreso guardado en ${jsonPath}`);

        } catch (err) {
            console.error(`❌ Error procesando ${fileName}: ${err.message}`);
            msg.esNotaVoz = true;
            msg.errorTranscripcion = err.message;
            modified = true;
            algunaProcesada = true;
            // También guardamos el error para no repetirlo
            await fs.promises.writeFile(jsonPath, JSON.stringify(messages), 'utf8');
        }
    }

    // 3. Guardado final (si hubo cambios o si no se había guardado antes)
    if (modified) {
        // Si algunaProcesada es false, significa que modified fue por errores o algo
        // De todas formas, si modified es true, guardamos.
        await fs.promises.writeFile(jsonPath, JSON.stringify(messages), 'utf8');
        console.log(`💾 JSON final guardado en ${jsonPath}`);
    } else {
        console.log(`ℹ️  No se procesaron nuevas notas de voz.`);
    }

    // 4. Opcional: si no hay notas de voz en absoluto, guardamos igual para futuras ejecuciones
    // (esto ya se maneja con modified, pero si no hay notas y el JSON no existe, no se guarda)
}

// ------------------------------------------------------------
// TAREA PRINCIPAL (process-subdirs)
// ------------------------------------------------------------
gulp.task('process-subdirs', async function (done) {
    const tmpDir = path.join(__dirname, 'tmp');

    try {
        // Leer subdirectorios de tmp
        const entries = await fs.promises.readdir(tmpDir, { withFileTypes: true });
        const subdirs = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);

        if (subdirs.length === 0) {
            console.log('⚠️  No hay subdirectorios en "tmp".');
            return done();
        }

        console.log(`📂 Se encontraron ${subdirs.length} subdirectorios:`);
        subdirs.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));

        // Procesar en serie
        console.log('\n⏳ Procesando en serie...');
        for (const name of subdirs) {
            const fullPath = path.join(tmpDir, name);
            if (name === 'Chat de WhatsApp con Directiva Flight Epic') {
                await procesarDirectorio(name, fullPath);
            }
        }

        console.log('\n🎉 Todos los directorios procesados.');
        done();

    } catch (err) {
        console.error('❌ Error:', err.message);
        done(err);
    }
});

/**
 * Copia archivos asociados a un chat a dist/[chat]/assets/
 * Busca los archivos por coincidencia de nombre (ignorando caracteres especiales)
 */
async function copyAssetsToDist(messages, rutaOrigen, distDir) {
    const assetsDir = path.join(distDir, 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    // Patrones para detectar diferentes tipos de archivos
    const imageRegex = /(IMG-\d+-\w+\.(jpg|jpeg|png|gif|webp))/i;
    const videoRegex = /(VID-\d+-\w+\.(mp4|mov|avi|mkv))/i;
    const docRegex = /([^\s]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt))/i;

    let copiedCount = 0;
    let updatedCount = 0;

    // Obtener todos los archivos del directorio origen (tmp/)
    let allFiles = [];
    try {
        allFiles = await fs.promises.readdir(rutaOrigen);
    } catch (err) {
        console.error(`❌ Error leyendo directorio ${rutaOrigen}:`, err.message);
        return messages;
    }

    // Función auxiliar para copiar un archivo
    async function copyFile(originalName, cleanName) {
        const origenPath = path.join(rutaOrigen, originalName);
        const destPath = path.join(assetsDir, cleanName);

        try {
            // Verificar si ya existe
            try {
                await fs.promises.access(destPath, fs.constants.F_OK);
                return false; // Ya existe
            } catch (_) {
                // No existe, copiar
            }

            await fs.promises.copyFile(origenPath, destPath);
            copiedCount++;
            console.log(`📁 Copiado: ${originalName} → ${cleanName}`);
            return true;
        } catch (err) {
            console.error(`❌ Error copiando ${originalName}:`, err.message);
            return false;
        }
    }

    for (const msg of messages) {
        // Solo procesar si es adjunto
        if (!msg.esAdjunto) continue;

        // ============================================================
        // 1. NOTAS DE VOZ: Buscar WAV (omitir OPUS y TXT)
        // ============================================================
        if (msg.mensaje && msg.mensaje.includes('.opus')) {
            // Extraer el nombre base del archivo .opus
            const opusMatch = msg.mensaje.match(/([^\s]+\.opus)/i);
            if (opusMatch) {
                let fileName = opusMatch[1].replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
                const fileMatch = fileName.match(/^([^\s]+(?:\.[^\s]+)?)/);
                if (fileMatch) {
                    fileName = fileMatch[1];
                }

                const cleanBaseName = cleanFileName(path.basename(fileName, '.opus'));
                console.log(`🔍 Buscando WAV para: ${fileName} → ${cleanBaseName}`);

                // Buscar el .wav relacionado
                let foundWav = null;
                let foundWavClean = null;
                for (const file of allFiles) {
                    if (file.endsWith('.wav')) {
                        const cleanFile = cleanFileName(file);
                        const cleanFileBase = path.basename(cleanFile, '.wav');
                        if (cleanFileBase === cleanBaseName ||
                            cleanFile.includes(cleanBaseName) ||
                            cleanBaseName.includes(cleanFileBase)) {
                            foundWav = file;
                            foundWavClean = cleanFile;
                            break;
                        }
                    }
                }

                if (foundWav) {
                    await copyFile(foundWav, foundWavClean);
                    msg.rutaWav = `assets/${foundWavClean}`;
                    updatedCount++;
                    console.log(`  ✅ WAV encontrado: ${foundWav} → ${foundWavClean}`);
                } else {
                    console.log(`  ⚠️  No se encontró .wav para: ${fileName}`);
                }
            }
            continue; // Saltar al siguiente mensaje
        }

        // ============================================================
        // 2. IMÁGENES, VIDEOS, DOCUMENTOS
        // ============================================================
        let match = msg.mensaje.match(imageRegex) ||
            msg.mensaje.match(videoRegex) ||
            msg.mensaje.match(docRegex);

        if (!match) continue;

        // Limpiar nombre de archivo
        let fileName = match[1].replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
        const fileMatch = fileName.match(/^([^\s]+(?:\.[^\s]+)?)/);
        if (fileMatch) {
            fileName = fileMatch[1];
        }

        const cleanFileName_ = cleanFileName(fileName);
        console.log(`🔍 Buscando: ${fileName} → ${cleanFileName_}`);

        // Buscar el archivo en el directorio origen
        let foundFile = null;
        let foundCleanName = null;

        // 1. Buscar por nombre limpio exacto
        for (const file of allFiles) {
            const cleanFile = cleanFileName(file);
            if (cleanFile === cleanFileName_) {
                foundFile = file;
                foundCleanName = cleanFile;
                break;
            }
        }

        // 2. Buscar por nombre base (sin extensión)
        if (!foundFile) {
            const baseName = path.basename(cleanFileName_, path.extname(cleanFileName_));
            for (const file of allFiles) {
                const cleanFile = cleanFileName(file);
                const fileBase = path.basename(cleanFile, path.extname(cleanFile));
                if (fileBase === baseName) {
                    foundFile = file;
                    foundCleanName = cleanFile;
                    break;
                }
            }
        }

        // 3. Buscar por coincidencia parcial
        if (!foundFile) {
            const baseName = path.basename(cleanFileName_, path.extname(cleanFileName_));
            for (const file of allFiles) {
                const cleanFile = cleanFileName(file);
                if (cleanFile.includes(baseName) || baseName.includes(cleanFile)) {
                    foundFile = file;
                    foundCleanName = cleanFile;
                    break;
                }
            }
        }

        if (!foundFile) {
            console.warn(`⚠️  No se encontró archivo para: ${fileName}`);
            continue;
        }

        // Copiar el archivo
        await copyFile(foundFile, foundCleanName);

        // Actualizar rutas en el mensaje
        if (foundCleanName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            msg.rutaImagen = `assets/${foundCleanName}`;
            updatedCount++;
        } else if (foundCleanName.match(/\.(mp4|mov|avi|mkv)$/i)) {
            msg.rutaVideo = `assets/${foundCleanName}`;
            updatedCount++;
        } else {
            msg.rutaArchivo = `assets/${foundCleanName}`;
            updatedCount++;
        }
    }

    console.log(`✅ ${copiedCount} archivos copiados a assets/`);
    console.log(`✅ ${updatedCount} rutas actualizadas en JSON`);
    return messages;
}

function processDataJson() {
    return gulp.src('dist/**/data.json', { base: './' })
        .pipe(through2.obj(function (file, enc, callback) {
            try {
                const jsonData = JSON.parse(file.contents.toString());
                const dirPath = path.dirname(file.path);
                const txtPath = path.join(dirPath, 'data.txt');

                let output = [];

                jsonData.forEach((item, index) => {
                    let lines = [];
                    let headerParts = [];

                    // Fecha
                    if (item.fecha) {
                        headerParts.push(`Fecha: ${item.fecha.trim()}`);
                    }

                    // Usuario
                    if (item.usuario) {
                        headerParts.push(`Usuario: ${item.usuario.trim()}`);
                    }

                    // Tipo (si es adjunto o nota de voz)
                    if (item.esAdjunto) {
                        if (item.esNotaVoz) {
                            headerParts.push(`Tipo: NOTA DE VOZ`);
                        } else {
                            headerParts.push(`Tipo: ADJUNTO`);
                        }
                    }

                    // Construir la línea de cabecera
                    if (headerParts.length > 0) {
                        lines.push(headerParts.join(' | '));
                    }

                    // Mensaje (si existe) - SIN SALTOS DE LÍNEA
                    if (item.mensaje && item.mensaje.trim()) {
                        const mensajeLimpio = item.mensaje.trim().replace(/\s+/g, ' ');
                        lines.push(`Mensaje: ${mensajeLimpio}`);
                    }

                    // Transcripción (si es nota de voz) - SIN SALTOS DE LÍNEA
                    if (item.esAdjunto && item.esNotaVoz && item.transcripcion && item.transcripcion.trim()) {
                        const transcripcionLimpia = item.transcripcion.trim().replace(/\s+/g, ' ');
                        lines.push(`Transcripción: ${transcripcionLimpia}`);
                    }

                    // Unir líneas y eliminar espacios extras
                    const cleanEntry = lines
                        .join('\n')
                        .replace(/[ \t]+/g, ' ')
                        .trim();

                    if (cleanEntry) {
                        output.push(cleanEntry);
                    }
                });

                // Separador entre mensajes (2 saltos de línea)
                const finalOutput = output.join('\n\n');
                fs.writeFileSync(txtPath, finalOutput, 'utf8');

                console.log(`✅ data.txt generado en: ${dirPath}`);

                callback(null, file);
            } catch (error) {
                console.error(`❌ Error procesando ${file.path}:`, error.message);
                callback(null, file);
            }
        }))
        .pipe(gulp.dest('.'));
}

gulp.task('generate-txt', processDataJson);

gulp.task('clean-assets', function (done) {
    const distPath = path.join(__dirname, 'dist');

    if (!fs.existsSync(distPath)) {
        console.log('⚠️  dist/ no existe');
        return done();
    }

    const chats = fs.readdirSync(distPath).filter(f =>
        fs.statSync(path.join(distPath, f)).isDirectory()
    );

    let count = 0;
    for (const chat of chats) {
        const assetsPath = path.join(distPath, chat, 'assets');
        if (fs.existsSync(assetsPath)) {
            fs.rmSync(assetsPath, { recursive: true, force: true });
            console.log(`🗑️  Eliminado: ${chat}/assets/`);
            count++;
        }
    }

    console.log(`✅ ${count} directorios assets eliminados`);
    done();
});

// Tarea para copiar src a dist sobrescribiendo todo
gulp.task('copy-src', function () {
    return gulp.src('src/**/*', { overwrite: true })
        .pipe(gulp.dest('dist'));
});

/**
 * Convierte el objeto JSON a Markdown
 */
function jsonToMarkdown(data) {
    let md = [];

    // Título y descripción
    md.push(`# ${data.nombre || 'Mi Proyecto'}`);
    md.push('');
    md.push(data.descripcion || '');
    md.push('');

    // Requisitos Previos
    if (data.requisitos_previos) {
        md.push('## 📋 Requisitos Previos');
        md.push('');
        data.requisitos_previos.forEach(req => {
            md.push(`- ${req}`);
        });
        md.push('');
    }

    // Instalación
    if (data.instalacion && data.instalacion.comandos) {
        md.push('## 🚀 Instalación');
        md.push('');
        md.push('```bash');
        data.instalacion.comandos.forEach(cmd => {
            md.push(cmd);
        });
        md.push('```');
        md.push('');
    }

    // Estructura del Proyecto
    if (data.estructura_proyecto) {
        md.push('## 📁 Estructura del Proyecto');
        md.push('');
        md.push('```text');
        md.push('proyecto/');
        md.push('├── tmp/                    # Directorio de trabajo temporal');
        md.push('│   └── [nombre-chat]/      # Carpeta para cada chat');
        md.push('│       ├── chat.txt        # Exportación de WhatsApp');
        md.push('│       └── *.opus          # Archivos de audio');
        md.push('├── dist/                   # Directorio de salida');
        md.push('│   └── [nombre-chat]/      # Chat procesado');
        md.push('│       ├── assets/         # Archivos multimedia');
        md.push('│       ├── data.json       # Datos procesados');
        md.push('│       └── index.html      # Visor web');
        md.push('├── zips/                   # Archivos ZIP de entrada');
        md.push('├── gulpfile.js             # Configuración principal');
        md.push('└── package.json');
        md.push('```');
        md.push('');
    }

    // Comandos Disponibles
    if (data.comandos_disponibles) {
        md.push('## 🛠️ Comandos Disponibles');
        md.push('');

        // Procesamiento Completo
        if (data.comandos_disponibles.procesamiento_completo) {
            const pc = data.comandos_disponibles.procesamiento_completo;
            md.push('### Procesamiento Completo');
            md.push('');
            md.push('```bash');
            md.push(pc.comando);
            md.push('```');
            md.push('');
            md.push('**Secuencia:**');
            if (pc.secuencia) {
                pc.secuencia.forEach(step => {
                    md.push(`- ${step}`);
                });
            }
            md.push('');
        }

        // Gestión de Archivos
        if (data.comandos_disponibles.gestion_archivos) {
            md.push('### Gestión de Archivos');
            md.push('');
            const ga = data.comandos_disponibles.gestion_archivos;

            Object.entries(ga).forEach(([key, value]) => {
                md.push(`#### \`${value.comando || key}\``);
                md.push(value.descripcion || '');
                md.push('');
                md.push('```bash');
                md.push(value.comando || '');
                md.push('```');
                if (value.entrada) md.push(`- **Entrada:** ${value.entrada}`);
                if (value.salida) md.push(`- **Salida:** ${value.salida}`);
                if (value.funcion) md.push(`- **Función:** ${value.funcion}`);
                if (value.utilidad) md.push(`- **Útil para:** ${value.utilidad}`);
                if (value.parametros) md.push(`- **Parámetros:** ${value.parametros}`);
                if (value.omite) md.push(`- **Omite:** ${value.omite}`);
                if (value.modelo) md.push(`- **Modelo:** ${value.modelo}`);
                md.push('');
            });
        }

        // Procesamiento de Audio
        if (data.comandos_disponibles.procesamiento_audio) {
            md.push('### Procesamiento de Audio');
            md.push('');
            const pa = data.comandos_disponibles.procesamiento_audio;

            Object.entries(pa).forEach(([key, value]) => {
                md.push(`#### \`${value.comando || key}\``);
                md.push(value.descripcion || '');
                md.push('');
                md.push('```bash');
                md.push(value.comando || '');
                md.push('```');
                if (value.entrada) md.push(`- **Entrada:** ${value.entrada}`);
                if (value.salida) md.push(`- **Salida:** ${value.salida}`);
                if (value.parametros) md.push(`- **Parámetros:** ${value.parametros}`);
                if (value.omite) md.push(`- **Omite:** ${value.omite}`);
                if (value.modelo) md.push(`- **Modelo:** ${value.modelo}`);
                md.push('');
            });
        }

        // Procesamiento de Chat
        if (data.comandos_disponibles.procesamiento_chat) {
            md.push('### Procesamiento de Chat');
            md.push('');
            const pc = data.comandos_disponibles.procesamiento_chat;

            Object.entries(pc).forEach(([key, value]) => {
                md.push(`#### \`${value.comando || key}\``);
                md.push(value.descripcion || '');
                md.push('');
                md.push('```bash');
                md.push(value.comando || '');
                md.push('```');
                if (value.funcionalidad) {
                    md.push('**Funcionalidad:**');
                    value.funcionalidad.forEach(func => {
                        md.push(`- ${func}`);
                    });
                }
                if (value.estructura_json) {
                    md.push('');
                    md.push('**Estructura del JSON:**');
                    md.push('```json');
                    md.push(JSON.stringify(value.estructura_json, null, 2));
                    md.push('```');
                }
                md.push('');
            });
        }

        // Gestión de Recursos
        if (data.comandos_disponibles.gestion_recursos) {
            md.push('### Gestión de Recursos y Assets');
            md.push('');
            const gr = data.comandos_disponibles.gestion_recursos;

            Object.entries(gr).forEach(([key, value]) => {
                md.push(`#### \`${value.comando || key}\``);
                md.push(value.descripcion || '');
                md.push('');
                md.push('```bash');
                md.push(value.comando || '');
                md.push('```');
                if (value.funcion) md.push(`- **Función:** ${value.funcion}`);
                if (value.elimina) md.push(`- **Elimina:** ${value.elimina.join(', ')}`);
                if (value.actualiza) md.push(`- **Actualiza:** ${value.actualiza}`);
                if (value.ejemplo) {
                    md.push('');
                    md.push('**Ejemplo de limpieza:**');
                    md.push('```text');
                    Object.entries(value.ejemplo).forEach(([k, v]) => {
                        md.push(`  ${k}: ${v}`);
                    });
                    md.push('```');
                }
                if (value.proceso) {
                    md.push('');
                    md.push('**Proceso:**');
                    value.proceso.forEach(step => {
                        md.push(`- ${step}`);
                    });
                }
                if (value.tipos_detectados) {
                    md.push('');
                    md.push('**Tipos detectados:**');
                    Object.entries(value.tipos_detectados).forEach(([k, v]) => {
                        md.push(`- **${k.charAt(0).toUpperCase() + k.slice(1)}:** ${v.join(', ')}`);
                    });
                }
                md.push('');
            });
        }

        // Generación de Salidas
        if (data.comandos_disponibles.generacion_salidas) {
            md.push('### Generación de Salidas');
            md.push('');
            const gs = data.comandos_disponibles.generacion_salidas;

            Object.entries(gs).forEach(([key, value]) => {
                md.push(`#### \`${value.comando || key}\``);
                md.push(value.descripcion || '');
                md.push('');
                md.push('```bash');
                md.push(value.comando || '');
                md.push('```');
                if (value.secuencia) {
                    md.push('**Secuencia:**');
                    value.secuencia.forEach(step => {
                        md.push(`- ${step}`);
                    });
                }
                if (value.caracteristicas) {
                    md.push('');
                    md.push('**Características:**');
                    value.caracteristicas.forEach(feature => {
                        md.push(`- ${feature}`);
                    });
                }
                if (value.salida) md.push(`- **Salida:** ${value.salida}`);
                if (value.formato) {
                    md.push('');
                    md.push('**Formato:**');
                    md.push('```text');
                    md.push(value.formato);
                    md.push('```');
                }
                md.push('');
            });
        }

        // Utilidades
        if (data.comandos_disponibles.utilidades) {
            md.push('### Utilidades');
            md.push('');
            const util = data.comandos_disponibles.utilidades;

            Object.entries(util).forEach(([key, value]) => {
                md.push(`#### \`${value.comando || key}\``);
                md.push(value.descripcion || '');
                md.push('');
                md.push('```bash');
                md.push(value.comando || '');
                md.push('```');
                if (value.salida) {
                    md.push('**Salida:**');
                    md.push('```text');
                    md.push(value.salida);
                    md.push('```');
                }
                md.push('');
            });
        }
    }

    // Flujo de Trabajo
    if (data.flujo_trabajo) {
        md.push('## 📊 Flujo de Trabajo Típico');
        md.push('');

        const sections = {
            'preparacion': '1️⃣ Preparación',
            'procesamiento': '2️⃣ Procesamiento',
            'generacion_salida': '3️⃣ Generación de Salida',
            'ver_resultados': '4️⃣ Ver Resultados'
        };

        Object.entries(sections).forEach(([key, title]) => {
            if (data.flujo_trabajo[key]) {
                md.push(`### ${title}`);
                md.push('```bash');
                data.flujo_trabajo[key].pasos.forEach(step => {
                    md.push(step);
                });
                md.push('```');
                md.push('');
            }
        });
    }

    // Características del Visor Web
    if (data.caracteristicas_visor_web) {
        md.push('## 🎯 Características del Visor Web');
        md.push('');

        if (data.caracteristicas_visor_web.principales) {
            md.push('### Funcionalidades Principales');
            md.push('');
            data.caracteristicas_visor_web.principales.forEach(feature => {
                md.push(`- ${feature}`);
            });
            md.push('');
        }

        if (data.caracteristicas_visor_web.interfaz_usuario) {
            md.push('### Interfaz de Usuario');
            md.push('');
            Object.entries(data.caracteristicas_visor_web.interfaz_usuario).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    md.push(`- **${key.charAt(0).toUpperCase() + key.slice(1)}:** ${value.join(', ')}`);
                } else {
                    md.push(`- **${key.charAt(0).toUpperCase() + key.slice(1)}:** ${value}`);
                }
            });
            md.push('');
        }
    }

    // Configuración
    if (data.configuracion) {
        md.push('## ⚙️ Configuración');
        md.push('');

        if (data.configuracion.variables_gulpfile) {
            md.push('### Variables en gulpfile.js');
            md.push('```javascript');
            Object.entries(data.configuracion.variables_gulpfile).forEach(([key, value]) => {
                md.push(`const ${key} = '${value}';`);
            });
            md.push('```');
            md.push('');
        }

        if (data.configuracion.parametros_whisper) {
            md.push('### Parámetros de Whisper');
            md.push('```javascript');
            md.push(`// ${data.configuracion.parametros_whisper.comando}`);
            md.push('```');
            if (data.configuracion.parametros_whisper.idioma) {
                md.push(`- \`-l es\`: ${data.configuracion.parametros_whisper.idioma}`);
            }
            if (data.configuracion.parametros_whisper.salida) {
                md.push(`- \`--output-txt\`: ${data.configuracion.parametros_whisper.salida}`);
            }
            md.push('');
        }
    }

    // Solución de Problemas
    if (data.solucion_problemas) {
        md.push('## 🔧 Solución de Problemas');
        md.push('');
        md.push('### Errores Comunes');
        md.push('');

        Object.entries(data.solucion_problemas).forEach(([key, value]) => {
            const title = key.replace(/_/g, ' ').toUpperCase();
            md.push(`#### ❌ ${title}`);
            md.push(value.error || '');
            md.push('');

            if (value.solucion) {
                md.push('```bash');
                md.push(value.solucion);
                md.push('```');
            }
            if (value.soluciones) {
                value.soluciones.forEach(sol => {
                    md.push(`- ${sol}`);
                });
            }
            if (value.solucion_mac || value.solucion_ubuntu || value.solucion_windows) {
                if (value.solucion_mac) md.push(`- **macOS:** ${value.solucion_mac}`);
                if (value.solucion_ubuntu) md.push(`- **Ubuntu/Debian:** ${value.solucion_ubuntu}`);
                if (value.solucion_windows) md.push(`- **Windows:** ${value.solucion_windows}`);
            }
            md.push('');
        });
    }

    // Notas Adicionales
    if (data.notas_adicionales) {
        md.push('## 📝 Notas Adicionales');
        md.push('');

        if (data.notas_adicionales.formato_chat_whatsapp) {
            md.push('### Formato del Chat de WhatsApp');
            md.push('El parser espera el formato estándar de exportación:');
            md.push('```text');
            md.push(data.notas_adicionales.formato_chat_whatsapp);
            md.push('```');
            md.push('');
        }

        if (data.notas_adicionales.caracteres_especiales) {
            md.push('### Caracteres Especiales');
            md.push('El sistema maneja automáticamente:');
            data.notas_adicionales.caracteres_especiales.forEach(item => {
                md.push(`- ${item}`);
            });
            md.push('');
        }

        if (data.notas_adicionales.rendimiento) {
            md.push('### Rendimiento');
            data.notas_adicionales.rendimiento.forEach(item => {
                md.push(`- ${item}`);
            });
            md.push('');
        }

        if (data.notas_adicionales.seguridad) {
            md.push('### Seguridad');
            data.notas_adicionales.seguridad.forEach(item => {
                md.push(`- ${item}`);
            });
            md.push('');
        }
    }

    // Contribución
    if (data.contribucion) {
        md.push('## 🤝 Contribución');
        md.push('Para añadir nuevas funcionalidades:');
        data.contribucion.pasos.forEach((step, index) => {
            md.push(`${index + 1}. ${step}`);
        });
        md.push('');
    }

    // Licencia
    if (data.licencia) {
        md.push('## 📄 Licencia');
        md.push('');
        md.push(data.licencia);
        md.push('');
    }

    return md.join('\n');
}

/**
 * Task de Gulp para generar README.md
 */
gulp.task('generate-readme', function (done) {
    try {
        const jsonPath = './README.json';
        const outputPath = './README.md';

        // Verificar que existe el JSON
        if (!fs.existsSync(jsonPath)) {
            console.error(`❌ No se encontró el archivo: ${jsonPath}`);
            console.log('📝 Por favor, crea el archivo readme-data.json');
            done();
            return;
        }

        // Leer y parsear JSON
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // Generar Markdown
        const markdown = jsonToMarkdown(jsonData);

        // Guardar archivo
        fs.writeFileSync(outputPath, markdown, 'utf8');

        console.log(`✅ README.md generado exitosamente en: ${outputPath}`);
        console.log(`📊 Tamaño: ${markdown.length} caracteres`);
        done();

    } catch (error) {
        console.error('❌ Error generando README.md:', error.message);
        done(error);
    }
});

gulp.task('resources', gulp.series(
    'clean-assets',
    'copy-assets'
));

// Comprimir y reemplazar PDFs
function compressPdfs() {
    return gulp.src('dist/**/*.pdf')
        .pipe(shell([
            'gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile="<%= file.path %>" "<%= file.path %>"'
        ]));
}
gulp.task('generate-pdf', compressPdfs);

// Tarea por defecto: ejecuta todas en serie
gulp.task('default', gulp.series(
    //'clean-tmp',
    //'unzip-all',
    'process-subdirs'
));