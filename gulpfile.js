const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

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

// Tarea 1: Listar archivos .opus en backup/ (sin dependencias externas)
gulp.task('list-opus', function (done) {
    const dir = './tmp';
    fs.readdir(dir, (err, files) => {
        if (err) {
            console.error('❌ Error al leer el directorio:', err.message);
            return done(err);
        }
        const opusFiles = files.filter(file => path.extname(file) === '.opus');
        if (opusFiles.length === 0) {
            console.log('⚠️ No se encontraron archivos .opus en backup/');
        } else {
            console.log('📁 Archivos .opus en backup/:');
            opusFiles.forEach(file => console.log('   ', file));
        }
        done();
    });
});

// Tarea 2: Limpiar directorio (ejemplo)
gulp.task('clean', function (done) {
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

// Tarea 3: Copiar archivos (ejemplo)
gulp.task('copy', function () {
    console.log('📦 Copiando assets...');
    return gulp.src('./backup/**/*.txt')
        .pipe(gulp.dest('./dist'));
});

// Tarea 4: Compilar (ejemplo)
gulp.task('build', function (done) {
    console.log('⚙️ Compilando proyecto...');
    done();
});

// Tarea por defecto: ejecuta todas en serie
gulp.task('default', gulp.series(
    'clean',
    'unzip-all',
    'list-opus',
    'copy',
    'build'
));