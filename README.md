# WhatsApp Chat Processor - Sistema de Transcripción y Visualización

Sistema completo para procesar conversaciones de WhatsApp, transcribir notas de voz, y generar una interfaz web interactiva para visualizar los chats.

## 📋 Requisitos Previos

- **Node.js** (v16 o superior)
- **ffmpeg** - Para conversión de audio
- **npm** o **yarn**

## 🚀 Instalación

```bash
# Instalar dependencias
npm install

# Verificar instalación de ffmpeg
ffmpeg -version
📁 Estructura del Proyecto
```

text
proyecto/
├── tmp/                    # Directorio de trabajo temporal
│   └── [nombre-chat]/      # Carpeta para cada chat
│       ├── chat.txt        # Exportación de WhatsApp
│       └── *.opus          # Archivos de audio
├── dist/                   # Directorio de salida
│   └── [nombre-chat]/      # Chat procesado
│       ├── assets/         # Archivos multimedia
│       ├── data.json       # Datos procesados
│       └── index.html      # Visor web
├── zips/                   # Archivos ZIP de entrada
├── gulpfile.js             # Configuración principal
└── package.json
🛠️ Comandos Disponibles
Procesamiento Completo
bash
# Ejecuta todo el pipeline completo
gulp default
Secuencia:

clean-tmp - Limpia directorio temporal

unzip-all - Descomprime archivos ZIP

process-subdirs - Procesa y transcribe

Gestión de Archivos
gulp unzip-all
Descomprime todos los archivos .zip del directorio zips/ en tmp/.

bash
gulp unzip-all
Entrada: zips/*.zip

Salida: tmp/[nombre-zip]/

Función: Extrae chats y archivos multimedia

gulp clean-tmp
Elimina completamente el directorio tmp/.

bash
gulp clean-tmp
Útil para: Empezar desde cero sin archivos residuales

Procesamiento de Audio
gulp covert-opus-wav
Convierte archivos .opus a .wav (formato compatible con Whisper).

bash
gulp covert-opus-wav
Entrada: tmp/**/*.opus

Salida: tmp/**/*.wav

Parámetros: 16kHz, mono, PCM 16-bit

Omite: Archivos que ya fueron convertidos

gulp covert-wav-txt
Transcribe archivos .wav a texto usando Whisper.

bash
gulp covert-wav-txt
Entrada: tmp/**/*.wav

Salida: tmp/**/*.wav.txt

Modelo: ggml-medium.bin (español)

Omite: Transcripciones existentes

Procesamiento de Chat
gulp process-subdirs
Procesa todos los subdirectorios en tmp/ generando JSON enriquecido.

bash
gulp process-subdirs
Funcionalidad:

Busca [chat].txt en cada subdirectorio

Parsea mensajes de WhatsApp

Identifica notas de voz (.opus)

Convierte .opus → .wav (si no existe)

Transcribe notas de voz

Genera data.json con metadatos

Estructura del JSON:

json
{
  "fecha": "12/12/2024 10:30",
  "usuario": "Nombre",
  "mensaje": "Contenido del mensaje",
  "esAdjunto": false,
  "esNotaVoz": true,
  "transcripcion": "Texto transcrito",
  "rutaOpus": "assets/audio.opus",
  "rutaWav": "assets/audio.wav"
}
Gestión de Recursos y Assets
gulp clean-assets-names
Limpia nombres de archivos eliminando caracteres especiales.

bash
gulp clean-assets-names
Función: Renombra archivos en dist/**/assets/

Elimina: Caracteres invisibles, espacios

Actualiza: Rutas en data.json

Ejemplo de limpieza:

text
Foto 📸 2024.jpg → Foto_2024.jpg
Audio (1).opus → Audio_1.opus
gulp copy-assets
Copia archivos multimedia a dist/[chat]/assets/.

bash
gulp copy-assets
Proceso:

Busca archivos referenciados en data.json

Detecta imágenes, videos, PDFs, audios

Copia a dist/[chat]/assets/

Actualiza rutas en el JSON

Mantiene nombres limpios

Tipos detectados:

Imágenes: .jpg, .jpeg, .png, .gif, .webp

Videos: .mp4, .mov, .avi, .mkv

Documentos: .pdf, .doc, .docx, .xls, .xlsx

Audio: .opus, .wav

Generación de Salidas
gulp resources
Pipeline completo de procesamiento de recursos (assets y HTML).

bash
gulp resources
Secuencia:

clean-assets-names - Limpia nombres

copy-assets - Copia archivos

generate-index - Genera HTML

gulp generate-index
Crea el visor web index.html en dist/.

bash
gulp generate-index
Características:

Lista de chats en sidebar

Visualización de mensajes

Reproductor de audio integrado

Galería de imágenes

Visor de PDFs

Enlaces a documentos

gulp generate-txt
Genera archivo data.txt con formato legible.

bash
gulp generate-txt
Salida: dist/**/data.txt
Formato:

text
Fecha: 12/12/2024 10:30
Usuario: Nombre
Mensaje: Contenido del mensaje
Tipo: NOTA DE VOZ
Transcripción: Texto transcrito
---
Utilidades
gulp list-tmp-files
Lista archivos en tmp/ mostrando nombres originales y limpios.

bash
gulp list-tmp-files
Salida:

text
📂 chat1:
  Foto 📸 2024.jpg → Foto_2024.jpg
  Audio (1).opus → Audio_1.opus
📊 Flujo de Trabajo Típico
1️⃣ Preparación
bash
# Limpiar directorios previos
gulp clean-tmp

# Colocar archivos:
# - zips/*.zip o
# - tmp/[chat]/chat.txt y archivos .opus
2️⃣ Procesamiento
bash
# Descomprimir (si usas ZIPs)
gulp unzip-all

# Procesar chats y transcribir
gulp process-subdirs
3️⃣ Generación de Salida
bash
# Copiar assets y generar HTML
gulp resources

# (Opcional) Generar archivo de texto
gulp generate-txt
4️⃣ Ver Resultados
bash
# Abrir el visor web
open dist/index.html

# O navegar a:
# http://localhost:8080 (si usas servidor)
⚙️ Configuración
Variables en gulpfile.js
javascript
// Configuración principal
const WHISPER_BIN = '.../whisper-cli';     // Binario de Whisper
const MODEL_PATH = '.../ggml-medium.bin';  // Modelo de idioma
const TMP_DIR = './tmp';                   // Directorio temporal
const DIST_DIR = './dist';                 // Directorio de salida
Parámetros de Whisper
javascript
// En transcribeWavToTxt()
const command = `${WHISPER_BIN} -m ${MODEL_PATH} -f "${wavPath}" -l es --output-txt`;
-l es: Idioma español

--output-txt: Genera archivo .txt

🔧 Solución de Problemas
Errores Comunes
❌ ffmpeg: command not found

bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows (con Chocolatey)
choco install ffmpeg
❌ Modelo no encontrado

bash
# Descargar modelo Whisper
cd node_modules/nwhisper/cpp/whisper.cpp/models/
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
❌ Permission denied en binario

bash
chmod +x node_modules/nwhisper/cpp/whisper.cpp/build/bin/whisper-cli
❌ Archivos no se copian

Verifica que data.json exista en tmp/[chat]/

Asegura que los nombres de archivo coincidan

Ejecuta gulp list-tmp-files para depurar

📝 Notas Adicionales
Formato del Chat de WhatsApp
El parser espera el formato estándar de exportación:

text
12/12/2024 10:30 - Usuario: Mensaje de texto
12/12/2024 10:31 - Usuario: <archivo adjunto: audio.opus>
Caracteres Especiales
El sistema maneja automáticamente:

Emojis y caracteres Unicode

Caracteres invisibles (direccionales)

Espacios y caracteres especiales en nombres

Rendimiento
Procesamiento incremental (guarda progreso)

Omite archivos ya procesados

Ideal para grandes volúmenes de datos

🤝 Contribución
Para añadir nuevas funcionalidades:

Modifica el gulpfile.js

Añade tu tarea al pipeline

Documenta en el README

📄 Licencia
MIT - Uso libre y sin restricciones.