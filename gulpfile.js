const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const through2 = require('through2');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const fsPromises = fs.promises;
const readdirAsync = promisify(fs.readdir);

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

// ============================================================
// FUNCIÓN PARA GENERAR EL HTML (VERSIÓN CON TEMPLATE LITERALS)
// ============================================================

function createHtmlTemplate(chats, defaultMessages) {
    // Escapar correctamente los datos para inyectarlos en JavaScript
    const chatsJson = JSON.stringify(chats);
    const messagesJson = JSON.stringify(defaultMessages);

    // Función para escapar comillas simples en strings
    function escapeQuotes(str) {
        return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    const escapedChats = escapeQuotes(chatsJson);
    const escapedMessages = escapeQuotes(messagesJson);

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Chats</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#0b141a;height:100vh;display:flex;overflow:hidden}
#sidebar{width:320px;min-width:320px;background:#111b21;border-right:1px solid #2a3942;display:flex;flex-direction:column;height:100vh}
#sidebar-header{padding:20px 16px;background:#111b21;border-bottom:1px solid #2a3942}
#sidebar-header h2{color:#e9edef;font-size:18px;font-weight:600}
#chat-list{flex:1;overflow-y:auto;padding:0;list-style:none}
#chat-list li{padding:12px 16px;color:#e9edef;cursor:pointer;border-bottom:1px solid #2a3942;transition:background .2s;display:flex;align-items:center;gap:12px}
#chat-list li:hover{background:#202c33}
#chat-list li.active{background:#2a3942}
.chat-avatar{width:40px;height:40px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0}
.chat-info{flex:1;min-width:0}
.chat-name{font-weight:500;font-size:16px;color:#e9edef}
.chat-preview{font-size:13px;color:#8696a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#chat-view{flex:1;background:#0b141a;display:flex;flex-direction:column;height:100vh}
#chat-header{padding:16px 20px;background:#111b21;border-bottom:1px solid #2a3942;display:flex;align-items:center;gap:14px;min-height:60px}
#chat-header .chat-avatar{width:36px;height:36px;font-size:16px}
#chat-header h3{color:#e9edef;font-size:16px;font-weight:500}
#chat-header .chat-status{color:#8696a0;font-size:13px}
#messages-container{flex:1;overflow-y:auto;padding:20px 40px;display:flex;flex-direction:column;gap:8px}
.message{max-width:75%;padding:8px 12px;border-radius:8px;word-wrap:break-word;animation:fadeIn .3s ease}
.message.received{background:#202c33;color:#e9edef;align-self:flex-start;border-bottom-left-radius:4px}
.message.sent{background:#005c4b;color:#e9edef;align-self:flex-end;border-bottom-right-radius:4px}
.message.system{background:#1f2c33;color:#8696a0;align-self:center;font-size:13px;padding:6px 16px;border-radius:12px;font-style:italic}
.message .msg-user{font-size:13px;font-weight:600;color:#25d366;margin-bottom:4px}
.message .msg-text{font-size:14px;line-height:1.5}
.message .msg-time{font-size:11px;color:#8696a0;text-align:right;margin-top:4px}
.msg-image{margin-top:8px;cursor:pointer;border-radius:8px;overflow:hidden;display:inline-block}
.msg-image img{max-width:100%;max-height:400px;border-radius:8px;display:block}
.msg-video{margin-top:8px;border-radius:8px;overflow:hidden;max-width:100%}
.msg-video video{max-width:100%;max-height:400px;border-radius:8px}
.msg-audio{background:#1f2c33;padding:12px 16px;border-radius:8px;margin-top:8px;min-width:250px}
.msg-audio .audio-controls{display:flex;align-items:center;gap:12px}
.msg-audio .play-btn{width:36px;height:36px;border-radius:50%;background:#25d366;border:none;color:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.msg-audio .play-btn:hover{background:#1fa855}
.msg-audio .audio-info{flex:1;color:#e9edef;font-size:13px}
.msg-audio .audio-progress{width:100%;height:4px;background:#3b4a54;border-radius:2px;margin-top:6px;cursor:pointer;position:relative}
.msg-audio .audio-progress .progress-bar{height:100%;background:#25d366;border-radius:2px;width:0;transition:width .1s}
.msg-audio .audio-time{font-size:11px;color:#8696a0;margin-top:4px;display:flex;justify-content:space-between}
.msg-audio .transcription{color:#8696a0;font-size:13px;padding:8px 12px;background:#111b21;border-radius:6px;border-left:3px solid #25d366;margin-top:8px}
.msg-audio .transcription-label{color:#25d366;font-size:11px;font-weight:600;margin-bottom:2px}
.msg-file{margin-top:8px;padding:12px 16px;background:#1f2c33;border-radius:8px;display:flex;align-items:center;gap:12px;text-decoration:none;color:#e9edef;border:1px solid #2a3942}
.msg-file:hover{background:#2a3942}
.msg-file .file-icon{font-size:28px;color:#25d366;flex-shrink:0}
.msg-file .file-info{flex:1;min-width:0}
.msg-file .file-name{font-size:14px;font-weight:500;color:#e9edef;word-break:break-all}
.msg-file .file-download{color:#25d366;font-size:18px}
.pdf-viewer{margin-top:8px;border-radius:8px;overflow:hidden;border:1px solid #2a3942}
.pdf-viewer iframe{width:100%;height:400px;border:none;background:#fff}
.pdf-viewer .pdf-controls{display:flex;gap:8px;padding:8px 12px;background:#111b21;border-top:1px solid #2a3942;flex-wrap:wrap}
.pdf-viewer .pdf-controls button{padding:6px 12px;background:#25d366;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}
.pdf-viewer .pdf-controls button:hover{background:#1fa855}
.pdf-viewer .pdf-controls a{color:#25d366;text-decoration:none;font-size:12px;padding:6px 12px;border:1px solid #25d366;border-radius:4px}
.pdf-viewer .pdf-controls a:hover{background:#25d366;color:#fff}
.lightbox{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.9);z-index:9999;align-items:center;justify-content:center;flex-direction:column;padding:20px}
.lightbox.active{display:flex}
.lightbox img{max-width:90%;max-height:85vh;object-fit:contain;border-radius:8px}
.lightbox .close-lightbox{position:absolute;top:20px;right:30px;color:#fff;font-size:40px;cursor:pointer;background:0 0;border:none}
.lightbox .lightbox-caption{color:#fff;margin-top:16px;font-size:14px;text-align:center;max-width:80%}
.lightbox .lightbox-nav{position:absolute;top:50%;transform:translateY(-50%);color:#fff;font-size:40px;cursor:pointer;padding:16px;background:rgba(0,0,0,.5);border-radius:50%;border:none}
.lightbox .lightbox-nav:hover{background:rgba(255,255,255,.2)}
.lightbox .lightbox-nav.prev{left:20px}
.lightbox .lightbox-nav.next{right:20px}
.empty-state{color:#8696a0;text-align:center;margin:auto;font-size:16px}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:#111b21}
::-webkit-scrollbar-thumb{background:#2a3942;border-radius:3px}
@media(max-width:768px){#sidebar{width:240px;min-width:240px}#messages-container{padding:12px 16px}.message{max-width:85%}.pdf-viewer iframe{height:300px}}
@media(max-width:600px){#sidebar{width:100%;min-width:unset;max-height:200px;border-right:none;border-bottom:1px solid #2a3942}body{flex-direction:column}.msg-audio{min-width:unset}}
    </style>
</head>
<body>
    <div id="sidebar">
        <div id="sidebar-header"><h2><i class="fas fa-comment-dots"></i> Chats</h2></div>
        <ul id="chat-list"></ul>
    </div>
    <div id="chat-view">
        <div id="chat-header">
            <div class="chat-avatar" id="chat-avatar">?</div>
            <div>
                <h3 id="chat-name">Selecciona un chat</h3>
                <div class="chat-status" id="chat-status">Clic en un chat para ver mensajes</div>
            </div>
        </div>
        <div id="messages-container"><div class="empty-state"><i class="fas fa-comment"></i> Selecciona un chat para ver los mensajes</div></div>
    </div>
    <div class="lightbox" id="lightbox">
        <button class="close-lightbox" onclick="closeLightbox()">&times;</button>
        <button class="lightbox-nav prev" onclick="navigateLightbox(-1)">&#10094;</button>
        <button class="lightbox-nav next" onclick="navigateLightbox(1)">&#10095;</button>
        <img id="lightbox-img" src="" alt="Imagen ampliada">
        <div class="lightbox-caption" id="lightbox-caption"></div>
    </div>
    <script>
        // Datos inyectados desde el servidor
        const chats = JSON.parse('${escapedChats}');
        let defaultMessages = JSON.parse('${escapedMessages}');
        let currentChat = chats.length > 0 ? chats[0] : null;
        let messagesCache = {};
        let lightboxImages = [];
        let lightboxIndex = 0;

        if (chats.length > 0 && defaultMessages.length > 0) {
            messagesCache[currentChat] = defaultMessages;
        }

        function getInitials(name) {
            return name.charAt(0).toUpperCase();
        }

        function getChatPreview(messages) {
            if (!messages || messages.length === 0) return 'Sin mensajes';
            var last = messages[messages.length - 1];
            if (!last) return 'Sin mensajes';
            var text = last.mensaje || '';
            if (last.esAdjunto) {
                if (last.mensaje && last.mensaje.indexOf('.opus') !== -1) return '🎵 Nota de voz';
                if (last.mensaje && last.mensaje.match(/\\.(jpg|jpeg|png|gif|webp)/i)) return '🖼️ Imagen';
                if (last.mensaje && last.mensaje.match(/\\.(mp4|mov|avi|mkv)/i)) return '🎬 Video';
                if (last.mensaje && last.mensaje.match(/\\.(pdf)/i)) return '📄 PDF';
                return '📎 Archivo adjunto';
            }
            return text.length > 30 ? text.substring(0, 30) + '...' : text;
        }

        function formatDate(fecha) {
            if (!fecha) return '';
            return fecha;
        }

        function getFileExtension(filename) {
            if (!filename) return '';
            return filename.split('.').pop().toLowerCase();
        }

        function getFileIcon(ext) {
            var icons = {
                'pdf': 'fa-file-pdf',
                'doc': 'fa-file-word',
                'docx': 'fa-file-word',
                'xls': 'fa-file-excel',
                'xlsx': 'fa-file-excel',
                'ppt': 'fa-file-powerpoint',
                'pptx': 'fa-file-powerpoint',
                'txt': 'fa-file-alt',
                'zip': 'fa-file-archive',
                'rar': 'fa-file-archive',
                'jpg': 'fa-file-image',
                'jpeg': 'fa-file-image',
                'png': 'fa-file-image',
                'gif': 'fa-file-image',
                'webp': 'fa-file-image',
                'mp4': 'fa-file-video',
                'mov': 'fa-file-video',
                'avi': 'fa-file-video',
                'mkv': 'fa-file-video',
                'mp3': 'fa-file-audio',
                'wav': 'fa-file-audio',
                'opus': 'fa-file-audio'
            };
            return icons[ext] || 'fa-file';
        }

        // Variable global para el chat actual (usado en rutas absolutas)
        let currentChatName = '';

        function renderChatList() {
            var list = document.getElementById('chat-list');
            list.innerHTML = '';
            if (chats.length === 0) {
                list.innerHTML = '<li style="color:#8696a0;text-align:center;padding:30px;">No hay chats</li>';
                return;
            }
            chats.forEach(function(chat) {
                var li = document.createElement('li');
                li.className = chat === currentChat ? 'active' : '';
                var messages = messagesCache[chat] || [];
                var preview = getChatPreview(messages);
                li.innerHTML = '<div class="chat-avatar">' + getInitials(chat) + '</div><div class="chat-info"><div class="chat-name">' + chat + '</div><div class="chat-preview">' + preview + '</div></div>';
                li.onclick = function() {
                    currentChat = chat;
                    currentChatName = chat;
                    renderChatList();
                    loadChat(chat);
                };
                list.appendChild(li);
            });
        }

        async function loadChat(chatName) {
            currentChatName = chatName;
            if (messagesCache[chatName]) {
                renderMessages(messagesCache[chatName]);
                updateHeader(chatName, messagesCache[chatName]);
                return;
            }
            try {
                var response = await fetch(chatName + '/data.json');
                if (!response.ok) throw new Error('No se pudo cargar');
                var data = await response.json();
                messagesCache[chatName] = data;
                renderMessages(data);
                updateHeader(chatName, data);
            } catch (err) {
                console.error('Error cargando chat:', err);
                document.getElementById('messages-container').innerHTML = '<div class="empty-state">❌ Error al cargar mensajes</div>';
            }
        }

        function updateHeader(chatName, messages) {
            document.getElementById('chat-name').textContent = chatName;
            document.getElementById('chat-avatar').textContent = getInitials(chatName);
            var count = messages ? messages.length : 0;
            document.getElementById('chat-status').textContent = count + ' mensajes';
        }

        // Función para construir ruta absoluta con el chat
        function getFullPath(chatName, filePath) {
            // Si ya es una URL absoluta, devolverla
            if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('/')) {
                return filePath;
            }
            // Si es relativa a assets/, construir con el chat
            if (filePath.startsWith('assets/')) {
                return chatName + '/' + filePath;
            }
            // Si es una ruta relativa simple
            return chatName + '/' + filePath;
        }

        function renderMessages(messages) {
            var container = document.getElementById('messages-container');
            if (!messages || messages.length === 0) {
                container.innerHTML = '<div class="empty-state">💬 No hay mensajes en este chat</div>';
                return;
            }
            var html = '';
            var lastUser = null;
            var chatName = currentChatName || currentChat || '';

            for (var i = 0; i < messages.length; i++) {
                var msg = messages[i];
                var messageClass = 'received';
                var showUser = false;
                var isSystem = msg.usuario === 'Sistema';
                if (isSystem) {
                    messageClass = 'system';
                } else if (lastUser !== msg.usuario) {
                    showUser = true;
                    lastUser = msg.usuario;
                }
                var userHtml = '';
                if (showUser && !isSystem) {
                    userHtml = '<div class="msg-user">' + msg.usuario + '</div>';
                }
                var adjuntoHtml = '';
                
                // IMÁGENES - usar ruta completa relativa al chat
                if (msg.rutaImagen) {
                    var imgPath = getFullPath(chatName, msg.rutaImagen);
                    adjuntoHtml = '<div class="msg-image" onclick="openLightboxImage(\\'' + imgPath + '\\', \\'' + (msg.usuario || '') + '\\')"><img src="' + imgPath + '" alt="Imagen" loading="lazy"></div>';
                }
                // VIDEOS
                else if (msg.rutaVideo) {
                    var videoPath = getFullPath(chatName, msg.rutaVideo);
                    adjuntoHtml = '<div class="msg-video"><video controls preload="metadata"><source src="' + videoPath + '" type="video/mp4"></video></div>';
                }
                // NOTAS DE VOZ
                else if (msg.esNotaVoz || (msg.mensaje && msg.mensaje.indexOf('.opus') !== -1)) {
                    var hasTranscription = msg.transcripcion && msg.transcripcion.length > 0;
                    var audioPath = msg.rutaWav || msg.rutaOpus || '';
                    // Si la ruta no tiene assets/, agregarlo
                    if (audioPath && !audioPath.startsWith('assets/') && !audioPath.startsWith('/')) {
                        audioPath = 'assets/' + audioPath.replace(/^.*?[\\\\/]/, '');
                    }
                    var audioSrc = getFullPath(chatName, audioPath);
                    adjuntoHtml = '<div class="msg-audio"><div class="audio-controls"><button class="play-btn" onclick="toggleAudio(this)" data-audio="' + audioSrc + '"><i class="fas fa-play"></i></button><div class="audio-info"><div><i class="fas fa-microphone"></i> Nota de voz</div><div class="audio-progress" onclick="seekAudio(event, this)"><div class="progress-bar"></div></div><div class="audio-time"><span class="current-time">0:00</span><span class="duration">0:00</span></div></div></div>' + (hasTranscription ? '<div class="transcription"><div class="transcription-label"><i class="fas fa-file-alt"></i> Transcripción:</div>' + msg.transcripcion + '</div>' : '<div class="transcription" style="color:#8696a0;font-style:italic;"><i class="fas fa-spinner fa-spin"></i> Procesando transcripción...</div>') + '</div>';
                }
                // PDF
                else if (msg.rutaArchivo && msg.rutaArchivo.indexOf('.pdf') !== -1) {
                    var pdfPath = msg.rutaArchivo;
                    if (pdfPath && !pdfPath.startsWith('assets/') && !pdfPath.startsWith('/')) {
                        pdfPath = 'assets/' + pdfPath.replace(/^.*?[\\\\/]/, '');
                    }
                    var pdfFullPath = getFullPath(chatName, pdfPath);
                    adjuntoHtml = '<div class="pdf-viewer"><iframe src="' + pdfFullPath + '#toolbar=0" title="PDF Viewer"></iframe><div class="pdf-controls"><button onclick="window.open(\\'' + pdfFullPath + '\\', \\'_blank\\')"><i class="fas fa-external-link-alt"></i> Abrir en nueva ventana</button><a href="' + pdfFullPath + '" download><i class="fas fa-download"></i> Descargar PDF</a></div></div>';
                }
                // OTROS ARCHIVOS
                else if (msg.rutaArchivo || msg.esAdjunto) {
                    var filePath = msg.rutaArchivo || msg.mensaje;
                    // Si es un string de mensaje, extraer solo el nombre del archivo
                    if (!msg.rutaArchivo) {
                        var matchFile = filePath.match(/([^\\s]+\\.[^\\s]+)/);
                        if (matchFile) {
                            filePath = 'assets/' + matchFile[1];
                        }
                    }
                    if (filePath && !filePath.startsWith('assets/') && !filePath.startsWith('/')) {
                        filePath = 'assets/' + filePath.replace(/^.*?[\\\\/]/, '');
                    }
                    var fileFullPath = getFullPath(chatName, filePath);
                    var fileName = filePath.split('/').pop();
                    var ext = getFileExtension(fileName);
                    var icon = getFileIcon(ext);
                    var officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
                    var isOffice = officeExtensions.indexOf(ext) !== -1;
                    adjuntoHtml = '<a href="' + fileFullPath + '" target="_blank" class="msg-file"><div class="file-icon"><i class="fas ' + icon + '"></i></div><div class="file-info"><div class="file-name">' + fileName + '</div><div class="file-size">' + (isOffice ? '📄 Documento Office' : '📎 Archivo') + '</div></div><div class="file-download"><i class="fas fa-download"></i></div></a>' + (isOffice ? '<div style="margin-top:4px;font-size:12px;color:#8696a0;"><i class="fas fa-info-circle"></i> <a href="https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(window.location.origin + '/' + fileFullPath) + '" target="_blank" style="color:#25d366;text-decoration:none;">Ver en Office Online</a></div>' : '');
                }

                html += '<div class="message ' + messageClass + '">' + userHtml + (!msg.esAdjunto && !msg.rutaImagen && !msg.rutaVideo ? '<div class="msg-text">' + (msg.mensaje || '') + '</div>' : '') + adjuntoHtml + '<div class="msg-time">' + formatDate(msg.fecha) + '</div></div>';
            }
            container.innerHTML = html;
            container.scrollTop = container.scrollHeight;
        }

        var currentAudio = null;
        var currentAudioBtn = null;

        function toggleAudio(btn) {
            var audioSrc = btn.getAttribute('data-audio');
            if (!audioSrc) {
                alert('No se encontró el archivo de audio');
                return;
            }
            if (currentAudio && currentAudio.src === audioSrc && !currentAudio.paused) {
                currentAudio.pause();
                btn.innerHTML = '<i class="fas fa-play"></i>';
                currentAudio = null;
                currentAudioBtn = null;
                return;
            }
            if (currentAudio) {
                currentAudio.pause();
                if (currentAudioBtn) {
                    currentAudioBtn.innerHTML = '<i class="fas fa-play"></i>';
                }
            }
            var audio = document.getElementById('audio-player');
            if (!audio) {
                audio = document.createElement('audio');
                audio.id = 'audio-player';
                document.body.appendChild(audio);
                audio.addEventListener('timeupdate', function() {
                    updateAudioProgress(this);
                });
                audio.addEventListener('ended', function() {
                    if (currentAudioBtn) {
                        currentAudioBtn.innerHTML = '<i class="fas fa-play"></i>';
                    }
                    var container = this.closest('.msg-audio');
                    if (container) {
                        var progressBar = container.querySelector('.progress-bar');
                        if (progressBar) progressBar.style.width = '0%';
                        var currentTime = container.querySelector('.current-time');
                        if (currentTime) currentTime.textContent = '0:00';
                    }
                    currentAudio = null;
                    currentAudioBtn = null;
                });
            }
            audio.src = audioSrc;
            audio.play();
            btn.innerHTML = '<i class="fas fa-pause"></i>';
            currentAudio = audio;
            currentAudioBtn = btn;
            var audioContainer = btn.closest('.msg-audio');
            if (audioContainer) {
                var durationDisplay = audioContainer.querySelector('.duration');
                audio.addEventListener('loadedmetadata', function() {
                    var minutes = Math.floor(this.duration / 60);
                    var seconds = Math.floor(this.duration % 60);
                    durationDisplay.textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
                });
            }
        }

        function updateAudioProgress(audio) {
            var container = audio.closest('.msg-audio');
            if (!container) return;
            var progressBar = container.querySelector('.progress-bar');
            var currentTime = container.querySelector('.current-time');
            if (progressBar && audio.duration) {
                var progress = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = progress + '%';
            }
            if (currentTime) {
                var minutes = Math.floor(audio.currentTime / 60);
                var seconds = Math.floor(audio.currentTime % 60);
                currentTime.textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
            }
        }

        function seekAudio(event, progressContainer) {
            var audio = document.getElementById('audio-player');
            if (!audio || !audio.src) return;
            var rect = progressContainer.getBoundingClientRect();
            var x = event.clientX - rect.left;
            var percentage = x / rect.width;
            audio.currentTime = percentage * audio.duration;
        }

        function openLightboxImage(src, caption) {
            var lightbox = document.getElementById('lightbox');
            var img = document.getElementById('lightbox-img');
            var captionEl = document.getElementById('lightbox-caption');
            var allImages = document.querySelectorAll('.msg-image img');
            lightboxImages = [];
            for (var i = 0; i < allImages.length; i++) {
                lightboxImages.push(allImages[i].src);
            }
            lightboxIndex = lightboxImages.indexOf(src);
            img.src = src;
            captionEl.textContent = caption || 'Imagen';
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeLightbox() {
            document.getElementById('lightbox').classList.remove('active');
            document.body.style.overflow = '';
        }

        function navigateLightbox(direction) {
            if (lightboxImages.length === 0) return;
            lightboxIndex += direction;
            if (lightboxIndex < 0) lightboxIndex = lightboxImages.length - 1;
            if (lightboxIndex >= lightboxImages.length) lightboxIndex = 0;
            var img = document.getElementById('lightbox-img');
            var caption = document.getElementById('lightbox-caption');
            img.src = lightboxImages[lightboxIndex];
            var imgElement = document.querySelector('img[src="' + lightboxImages[lightboxIndex] + '"]');
            if (imgElement) {
                var parent = imgElement.closest('.msg-image');
                if (parent) {
                    var user = parent.closest('.message').querySelector('.msg-user');
                    caption.textContent = user ? user.textContent : 'Imagen';
                }
            }
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') { closeLightbox(); }
            if (e.key === 'ArrowLeft') { navigateLightbox(-1); }
            if (e.key === 'ArrowRight') { navigateLightbox(1); }
        });

        if (chats.length > 0) {
            currentChat = chats[0];
            currentChatName = chats[0];
            renderChatList();
            if (messagesCache[currentChat]) {
                renderMessages(messagesCache[currentChat]);
                updateHeader(currentChat, messagesCache[currentChat]);
            } else {
                loadChat(currentChat);
            }
        } else {
            renderChatList();
            document.getElementById('messages-container').innerHTML = '<div class="empty-state">💬 No hay chats disponibles</div>';
        }
    </script>
</body>
</html>`;
}
gulp.task('generate-index', async function (done) {
    try {
        const distPath = DIST_DIR;
        await fs.promises.mkdir(distPath, { recursive: true });

        const entries = await fs.promises.readdir(distPath, { withFileTypes: true });
        const chats = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(name => !name.startsWith('.'));

        if (chats.length === 0) {
            console.log('⚠️  No hay chats en dist/ para mostrar.');
            const html = createHtmlTemplate([], []);
            await fs.promises.writeFile(path.join(distPath, 'index.html'), html, 'utf8');
            return done();
        }

        // Leer el primer chat para mostrar por defecto
        let defaultMessages = [];
        try {
            const firstChatPath = path.join(distPath, chats[0], 'data.json');
            const content = await fs.promises.readFile(firstChatPath, 'utf8');
            defaultMessages = JSON.parse(content);
            console.log(`📄 Cargado ${chats[0]}/data.json con ${defaultMessages.length} mensajes`);
        } catch (_) {
            console.warn(`⚠️  No se encontró data.json en ${chats[0]}`);
        }

        console.log('📂 Generando index.html con ' + chats.length + ' chats...');
        console.log('   Chats:', chats.join(', '));

        const html = createHtmlTemplate(chats, defaultMessages);
        const indexPath = path.join(distPath, 'index.html');
        await fs.promises.writeFile(indexPath, html, 'utf8');

        console.log('✅ index.html generado en ' + indexPath);
        done();
    } catch (err) {
        console.error('❌ Error generando index.html:', err.message);
        done(err);
    }
});

/**
 * Busca un archivo en un directorio por coincidencia de nombre (ignorando caracteres especiales)
 */
async function findFileInDir(dirPath, fileName) {
    try {
        const files = await fs.promises.readdir(dirPath);

        // Limpiar el nombre buscado
        const searchName = cleanFileName(fileName);

        // Buscar coincidencia exacta o parcial
        for (const file of files) {
            const cleanFile = cleanFileName(file);
            // Coincidencia exacta después de limpiar
            if (cleanFile === searchName) {
                return path.join(dirPath, file);
            }
            // Coincidencia parcial (ignorando extensión)
            const searchBase = path.basename(searchName, path.extname(searchName));
            const fileBase = path.basename(cleanFile, path.extname(cleanFile));
            if (searchBase === fileBase) {
                return path.join(dirPath, file);
            }
            // Coincidencia por contenido (el nombre buscado está contenido en el nombre del archivo)
            if (searchBase && file.includes(searchBase)) {
                return path.join(dirPath, file);
            }
        }

        // Si no se encuentra, buscar por extensión y contenido
        const ext = path.extname(searchName);
        for (const file of files) {
            if (file.endsWith(ext) && file.includes(path.basename(searchName, ext))) {
                return path.join(dirPath, file);
            }
        }

        return null;
    } catch (err) {
        console.error(`Error buscando archivo en ${dirPath}:`, err.message);
        return null;
    }
}

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
/**
 * Limpia nombres de archivos en dist/[chat]/assets/ eliminando caracteres invisibles
 */
gulp.task('clean-assets-names', async function (done) {
    try {
        console.log('🧹 Limpiando nombres de archivos en assets/...');
        const distPath = DIST_DIR;

        // Obtener todos los chats
        const entries = await fs.promises.readdir(distPath, { withFileTypes: true });
        const chats = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(name => !name.startsWith('.'));

        let totalRenamed = 0;

        for (const chat of chats) {
            const assetsDir = path.join(distPath, chat, 'assets');

            // Verificar si existe el directorio assets
            try {
                await fs.promises.access(assetsDir, fs.constants.F_OK);
            } catch (_) {
                continue;
            }

            console.log(`\n📂 Procesando: ${chat}/assets/`);

            const files = await fs.promises.readdir(assetsDir);

            for (const file of files) {
                const cleanName = cleanFileName(file);

                // Si el nombre ya está limpio, saltar
                if (file === cleanName) {
                    continue;
                }

                const oldPath = path.join(assetsDir, file);
                const newPath = path.join(assetsDir, cleanName);

                try {
                    // Verificar si el archivo destino ya existe
                    try {
                        await fs.promises.access(newPath, fs.constants.F_OK);
                        console.log(`⏭️  El archivo destino ya existe: ${cleanName}`);
                        // Eliminar el archivo con nombre sucio
                        await fs.promises.unlink(oldPath);
                        console.log(`🗑️  Eliminado: ${file}`);
                        continue;
                    } catch (_) {
                        // El destino no existe, renombrar
                    }

                    await fs.promises.rename(oldPath, newPath);
                    totalRenamed++;
                    console.log(`🔄 Renombrado: ${file} → ${cleanName}`);
                } catch (err) {
                    console.error(`❌ Error renombrando ${file}:`, err.message);
                }
            }
        }

        console.log(`\n✅ ${totalRenamed} archivos renombrados correctamente.`);

        // Después de limpiar nombres, actualizar el JSON
        await updateJsonWithCleanNames();

        done();
    } catch (err) {
        console.error('❌ Error:', err.message);
        done(err);
    }
});

/**
 * Actualiza el JSON con los nombres limpios de los archivos
 */
async function updateJsonWithCleanNames() {
    console.log('\n📝 Actualizando JSON con nombres limpios...');
    const distPath = DIST_DIR;

    const entries = await fs.promises.readdir(distPath, { withFileTypes: true });
    const chats = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => !name.startsWith('.'));

    let totalUpdated = 0;

    for (const chat of chats) {
        const jsonPath = path.join(distPath, chat, 'data.json');
        const assetsDir = path.join(distPath, chat, 'assets');

        try {
            await fs.promises.access(jsonPath, fs.constants.F_OK);
        } catch (_) {
            continue;
        }

        // Cargar JSON
        const content = await fs.promises.readFile(jsonPath, 'utf8');
        const messages = JSON.parse(content);

        // Obtener lista de archivos en assets/
        let assetsFiles = [];
        try {
            assetsFiles = await fs.promises.readdir(assetsDir);
        } catch (_) {
            // No hay assets, saltar
            continue;
        }

        let modified = false;

        for (const msg of messages) {
            // Verificar y limpiar rutas de archivos
            const fields = ['rutaImagen', 'rutaArchivo', 'rutaOpus', 'rutaWav', 'rutaTxt'];

            for (const field of fields) {
                if (msg[field]) {
                    // Extraer solo el nombre del archivo de la ruta
                    const oldFileName = path.basename(msg[field]);
                    const cleanName = cleanFileName(oldFileName);

                    // Si el nombre cambió, actualizar la ruta
                    if (oldFileName !== cleanName) {
                        // Verificar que el archivo con nombre limpio existe
                        const cleanPath = path.join(assetsDir, cleanName);
                        try {
                            await fs.promises.access(cleanPath, fs.constants.F_OK);
                            msg[field] = `assets/${cleanName}`;
                            modified = true;
                            console.log(`  ✅ ${chat}: ${field} → assets/${cleanName}`);
                        } catch (_) {
                            // El archivo no existe, buscar alternativas
                            // Buscar cualquier archivo que coincida con el nombre base
                            const baseName = path.basename(oldFileName, path.extname(oldFileName));
                            for (const assetFile of assetsFiles) {
                                const cleanAsset = cleanFileName(assetFile);
                                if (cleanAsset.startsWith(baseName) || assetFile.includes(baseName)) {
                                    msg[field] = `assets/${cleanAsset}`;
                                    modified = true;
                                    console.log(`  ✅ ${chat}: ${field} → assets/${cleanAsset}`);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (modified) {
            await fs.promises.writeFile(jsonPath, JSON.stringify(messages, null, 2), 'utf8');
            totalUpdated++;
            console.log(`  💾 JSON actualizado: ${chat}/data.json`);
        }
    }

    console.log(`✅ ${totalUpdated} JSONs actualizados con nombres limpios.`);
}

function processDataJson() {
    return gulp.src('dist/**/data.json', { base: './' })
        .pipe(through2.obj(function (file, enc, callback) {
            try {
                // Leer el contenido del JSON
                const jsonData = JSON.parse(file.contents.toString());
                const dirPath = path.dirname(file.path);
                const txtPath = path.join(dirPath, 'data.txt');

                let output = [];

                // Procesar cada elemento del array
                jsonData.forEach(item => {
                    let entry = [];

                    // Fecha y usuario
                    entry.push(`Fecha: ${item.fecha}`);
                    entry.push(`Usuario: ${item.usuario}`);

                    // Mensaje principal
                    if (item.mensaje) {
                        entry.push(`Mensaje: ${item.mensaje}`);
                    }

                    // Procesar adjuntos
                    if (item.esAdjunto) {
                        if (item.esNotaVoz && item.transcripcion) {
                            // Es una nota de voz con transcripción
                            entry.push('Tipo: NOTA DE VOZ');
                            entry.push(`Transcripción: ${item.transcripcion}`);
                        } else {
                            // Es otro tipo de adjunto
                            entry.push('Tipo: ADJUNTO (referencia en mensaje)');
                        }
                    }

                    // Separador entre mensajes
                    entry.push('---');
                    output.push(entry.join('\n'));
                });

                // Escribir el archivo de texto
                fs.writeFileSync(txtPath, output.join('\n\n'), 'utf8');

                console.log(`✅ data.txt generado en: ${dirPath}`);

                callback(null, file);
            } catch (error) {
                console.error(`❌ Error procesando ${file.path}:`, error.message);
                callback(null, file);
            }
        }))
        .pipe(gulp.dest('.'));
}

// Tarea principal
gulp.task('generate-txt', processDataJson);

gulp.task('resources', gulp.series(
    'clean-assets-names',
    'copy-assets',
    'generate-index'
));

// Tarea por defecto: ejecuta todas en serie
gulp.task('default', gulp.series(
    //'clean-tmp',
    //'unzip-all',
    'process-subdirs'
));