# WhatsApp Chat Processor - Sistema de Transcripción y Visualización

Sistema completo para procesar conversaciones de WhatsApp, transcribir notas de voz usando Whisper, y generar una interfaz web interactiva para visualizar los chats con funcionalidad de descarga de audio.

## 📋 Requisitos Previos

- Node.js (v16 o superior)
- ffmpeg - Para conversión de audio (instalación obligatoria)
- npm o yarn para gestión de paquetes
- Modelo Whisper ggml-medium.bin para transcripción en español

## 🚀 Instalación

```bash
# Instalar dependencias del proyecto
npm install

# Verificar instalación de ffmpeg (necesario para conversión de audio)
ffmpeg -version

# Verificar que los binarios de Whisper estén disponibles
ls node_modules/nwhisper/cpp/whisper.cpp/build/bin/whisper-cli

# Descargar el modelo de Whisper (si no existe)
cd node_modules/nwhisper/cpp/whisper.cpp/models/
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
```

## 📁 Estructura del Proyecto

```text
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
```

## 🛠️ Comandos Disponibles

### Procesamiento Completo

```bash
gulp default
```

**Secuencia:**
- clean-tmp - Limpia el directorio temporal (comentado por defecto)
- unzip-all - Descomprime archivos ZIP (comentado por defecto)
- process-subdirs - Procesa y transcribe los chats

### Gestión de Archivos

#### `gulp unzip-all`
Descomprime todos los archivos .zip del directorio zips/ en tmp/

```bash
gulp unzip-all
```
- **Entrada:** zips/*.zip
- **Salida:** tmp/[nombre-zip]/
- **Función:** Extrae chats y archivos multimedia manteniendo la estructura

#### `gulp clean-tmp`
Elimina completamente el directorio tmp/

```bash
gulp clean-tmp
```
- **Útil para:** Empezar desde cero sin archivos residuales de procesamientos anteriores

#### `gulp clean-assets`
Elimina los directorios assets/ de todos los chats en dist/

```bash
gulp clean-assets
```
- **Útil para:** Limpiar archivos multimedia antes de regenerarlos

### Procesamiento de Audio

#### `gulp covert-opus-wav`
Convierte archivos .opus a .wav (formato compatible con Whisper)

```bash
gulp covert-opus-wav
```
- **Entrada:** tmp/**/*.opus (búsqueda recursiva)
- **Salida:** tmp/**/*.wav (mismo directorio que el .opus original)
- **Parámetros:** 16kHz, mono, PCM 16-bit (formato óptimo para Whisper)
- **Omite:** Archivos que ya fueron convertidos para evitar reprocesamiento

#### `gulp covert-wav-txt`
Transcribe archivos .wav a texto usando Whisper

```bash
gulp covert-wav-txt
```
- **Entrada:** tmp/**/*.wav (búsqueda recursiva)
- **Salida:** tmp/**/*.wav.txt (transcripción en texto plano)
- **Omite:** Transcripciones existentes para ahorrar tiempo
- **Modelo:** ggml-medium.bin (modelo optimizado para español)

### Procesamiento de Chat

#### `gulp process-subdirs`
Procesa todos los subdirectorios en tmp/ generando JSON enriquecido

```bash
gulp process-subdirs
```
**Funcionalidad:**
- Busca [chat].txt en cada subdirectorio de tmp/
- Parsea mensajes de WhatsApp con formato estándar
- Identifica notas de voz (.opus) en los mensajes
- Convierte .opus → .wav usando ffmpeg (si no existe)
- Transcribe notas de voz con Whisper (si no tiene transcripción)
- Genera data.json con metadatos enriquecidos
- Guarda progreso incrementalmente (después de cada nota de voz)
- Maneja errores de transcripción sin detener el proceso

**Estructura del JSON:**
```json
{
  "fecha": "12/12/2024 10:30",
  "usuario": "Nombre del participante",
  "mensaje": "Contenido del mensaje o referencia al archivo adjunto",
  "esAdjunto": false,
  "esNotaVoz": true,
  "transcripcion": "Texto transcrito por Whisper",
  "rutaOpus": "assets/audio.opus (ruta relativa)",
  "rutaWav": "assets/audio.wav (ruta relativa)",
  "errorTranscripcion": "Mensaje de error si falló (solo en caso de error)"
}
```

### Gestión de Recursos y Assets

#### `gulp copy-assets`
Copia archivos multimedia a dist/[chat]/assets/ y actualiza rutas en data.json

```bash
gulp copy-assets
```

**Proceso:**
- Lee todos los subdirectorios en tmp/
- Carga data.json de cada chat (si existe)
- Detecta imágenes (JPG, PNG, GIF, WebP, SVG)
- Detecta videos (MP4, MOV, AVI, MKV)
- Detecta documentos (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX)
- Detecta notas de voz (WAV)
- Limpia nombres de archivos (elimina caracteres especiales)
- Copia los archivos a dist/[chat]/assets/
- Actualiza las rutas en data.json
- Mantiene nombres limpios y consistentes

**Tipos detectados:**
- **Imagenes:** .jpg, .jpeg, .png, .gif, .webp, .svg
- **Videos:** .mp4, .mov, .avi, .mkv
- **Documentos:** .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx
- **Audio:** .wav, .opus

#### `gulp list-tmp-files (incluye limpieza de nombres)`
Limpia nombres de archivos eliminando caracteres especiales

```bash
gulp list-tmp-files (incluye limpieza de nombres)
```
- **Función:** Muestra nombres originales y limpios para verificar
- **Elimina:** Caracteres invisibles Unicode (direccionales), Espacios (reemplazados por _), Caracteres especiales que causan problemas en URLs

**Ejemplo de limpieza:**
```text
  original: Foto 📸 2024.jpg
  limpio: Foto_2024.jpg
```

### Generación de Salidas

#### `gulp resources`
Pipeline completo de procesamiento de recursos (assets y HTML)

```bash
gulp resources
```
**Secuencia:**
- clean-assets - Limpia assets existentes
- copy-assets - Copia nuevos archivos y actualiza JSON

#### `gulp copy-src (copia el visor web)`
Copia los archivos del visor web (src/) a dist/

```bash
gulp copy-src (copia el visor web)
```

**Características:**
- Lista de chats en sidebar con preview
- Visualización de mensajes estilo WhatsApp
- Reproductor de audio integrado con controles
- Botón de descarga para notas de voz (fetch con manejo de errores)
- Galería de imágenes con lightbox interactivo
- Visor de PDFs integrado
- Reproducción de videos en línea
- Carga diferida (lazy loading) para optimizar rendimiento
- Scroll infinito hacia arriba para cargar mensajes antiguos
- Transcripción de notas de voz visible junto al audio
- Interfaz responsive y adaptativa

#### `gulp generate-txt`
Genera archivo data.txt con formato legible

```bash
gulp generate-txt
```
- **Salida:** dist/**/data.txt (uno por cada chat)

**Formato:**
```text
Fecha: 12/12/2024 10:30
Usuario: Nombre
Mensaje: Contenido del mensaje
Tipo: NOTA DE VOZ
Transcripción: Texto transcrito
---
```

### Utilidades

#### `gulp list-tmp-files`
Lista archivos en tmp/ mostrando nombres originales y limpios

```bash
gulp list-tmp-files
```
**Salida:**
```text
📂 chat1:
  Foto 📸 2024.jpg → Foto_2024.jpg
  Audio (1).opus → Audio_1.opus
```

## 📊 Flujo de Trabajo Típico

### 1️⃣ Preparación
```bash
# Limpiar directorios previos (opcional)
gulp clean-tmp

# Colocar archivos en las ubicaciones correctas:
# - zips/*.zip (para descomprimir automáticamente)
# - o directamente en tmp/[chat]/chat.txt y archivos .opus
```

### 2️⃣ Procesamiento
```bash
# Descomprimir archivos ZIP (si usas)
gulp unzip-all

# Procesar chats y transcribir notas de voz
gulp process-subdirs
```

### 3️⃣ Generación de Salida
```bash
# Copiar assets y generar estructura final
gulp resources

# (Opcional) Generar archivos de texto legibles
gulp generate-txt

# (Opcional) Copiar visor web (si necesitas actualizarlo)
gulp copy-src
```

### 4️⃣ Ver Resultados
```bash
# Abrir el visor web (usando un servidor local o navegador)
open dist/index.html

# O servir con un servidor HTTP (ejemplo con Python)
python -m http.server 8000 --directory dist
# Luego navegar a: http://localhost:8000
```

## 🎯 Características del Visor Web

### Funcionalidades Principales

- Visualización de chats con formato estilo WhatsApp
- Reproducción de notas de voz con controles de reproducción
- 📥 Descarga de notas de voz - Botón dedicado para cada audio con feedback visual
- Galería de imágenes con lightbox interactivo (navegación por teclado)
- Visor de PDFs integrado
- Reproducción de videos en línea
- Carga diferida (lazy loading) para optimizar rendimiento
- Scroll infinito hacia arriba para cargar mensajes antiguos
- Transcripción de notas de voz visible junto al audio
- Interfaz responsive para dispositivos móviles
- Atajos de teclado (Esc para cerrar lightbox, flechas para navegar)

### Interfaz de Usuario

- **Sidebar:** Lista de todos los chats disponibles con preview y conteo
- **Area_principal:** Mensajes en orden cronológico (más recientes abajo)
- **Controles_audio:** Play/Pause, Barra de progreso interactiva, Tiempo actual/Duración
- **Boton_descarga:** Ícono de descarga junto a cada nota de voz con estado de carga
- **Indicadores:** Estado de carga de mensajes, Contador de mensajes, Indicador de transcripción

## ⚙️ Configuración

### Variables en gulpfile.js
```javascript
const WHISPER_BIN = './node_modules/nwhisper/cpp/whisper.cpp/build/bin/whisper-cli';
const MODEL_PATH = './node_modules/nwhisper/cpp/whisper.cpp/models/ggml-medium.bin';
const TMP_DIR = './tmp';
const DIST_DIR = './dist';
```

### Parámetros de Whisper
```javascript
// whisper-cli -m ${MODEL_PATH} -f "${wavPath}" -l es --output-txt
```
- `-l es`: español (modelo optimizado)
- `--output-txt`: archivo .txt con la transcripción

## 🔧 Solución de Problemas

### Errores Comunes

#### ❌ FFMPEG NOT FOUND
ffmpeg: command not found (necesario para conversión de audio)

- **macOS:** brew install ffmpeg
- **Ubuntu/Debian:** sudo apt install ffmpeg
- **Windows:** choco install ffmpeg (con Chocolatey) o descargar manual

#### ❌ WHISPER BIN NOT FOUND
Binario de Whisper no encontrado

```bash
cd node_modules/nwhisper/cpp/whisper.cpp && mkdir -p build && cd build && cmake .. && make
```

#### ❌ MODELO NO ENCONTRADO
Modelo ggml-medium.bin no encontrado

```bash
cd node_modules/nwhisper/cpp/whisper.cpp/models/ && wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
```

#### ❌ PERMISO DENEGADO
Permission denied en binario de Whisper

```bash
chmod +x node_modules/nwhisper/cpp/whisper.cpp/build/bin/whisper-cli
```

#### ❌ ARCHIVOS NO COPIAN
Los archivos no se copian a dist/

- Verificar que data.json exista en tmp/[chat]/
- Asegurar que los nombres de archivo coincidan (el sistema limpia caracteres especiales)
- Ejecutar gulp list-tmp-files para depurar y ver nombres limpios
- Verificar permisos de escritura en dist/

#### ❌ DESCARGA AUDIO FALLA
La descarga de notas de voz no funciona en el visor web

- Verificar que los archivos WAV estén en dist/[chat]/assets/
- Comprobar que las rutas en data.json sean relativas (assets/audio.wav)
- Asegurar que el navegador permita descargas y tenga acceso al archivo
- Revisar la consola del navegador para ver errores de CORS o 404

#### ❌ TRANSCRIPCION FALLA
Falla en la transcripción de notas de voz

- Verificar que el modelo Whisper esté instalado y accesible
- Comprobar que el archivo WAV se generó correctamente (tamaño > 0)
- Revisar que el audio tenga contenido válido (no esté corrupto)
- El sistema guarda errores en data.json para identificación

## 📝 Notas Adicionales

### Formato del Chat de WhatsApp
El parser espera el formato estándar de exportación:
```text
12/12/2024 10:30 - Usuario: Mensaje de texto
12/12/2024 10:31 - Usuario: <archivo adjunto: audio.opus>
12/12/2024 10:32 - Usuario: (archivo adjunto) Foto.jpg
```

### Caracteres Especiales
El sistema maneja automáticamente:
- Emojis y caracteres Unicode (se mantienen en el texto)
- Caracteres invisibles (direccionales) se eliminan automáticamente
- Espacios y caracteres especiales en nombres se reemplazan por _
- Caracteres de formato específicos de WhatsApp se limpian

### Rendimiento
- Procesamiento incremental - guarda progreso después de cada nota de voz
- Omite archivos ya procesados (conversión y transcripción)
- Carga diferida (lazy loading) en el visor web para optimizar rendimiento
- Ideal para grandes volúmenes de datos y chats extensos
- Búsqueda recursiva de archivos en todas las subcarpetas

### Seguridad
- Las descargas de audio se realizan mediante fetch con manejo de errores
- Validación de URLs y tipos de archivo antes de la descarga
- Feedback visual para el usuario durante la descarga
- Los archivos se copian y sirven desde dist/ para evitar acceso directo a tmp/

## 🤝 Contribución
Para añadir nuevas funcionalidades:
1. Modificar el gulpfile.js para añadir nuevas funcionalidades
2. Añadir tu tarea al pipeline en la sección correspondiente
3. Actualizar la documentación en este README.json
4. Probar con datos de prueba antes de usar en producción
5. Hacer commit de los cambios con mensajes descriptivos

## 📄 Licencia

MIT - Uso libre y sin restricciones. Atribución no requerida pero apreciada.
