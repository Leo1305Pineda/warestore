/**
 * WhatsApp Chat Viewer - Main Application
 * Versión con carga diferida por scroll (carga hacia arriba) - CORREGIDA
 * Con funcionalidad de descarga de notas de voz
 */

// ============================================================
// CONFIGURACIÓN
// ============================================================

const ORIGIN = window.location.origin;
const BLOCK_SIZE = 50; // Número de mensajes por bloque

// ============================================================
// ESTADO DE LA APLICACIÓN
// ============================================================

let chats = [];
let currentChat = null;
let messagesCache = {};
let lightboxImages = [];
let lightboxIndex = 0;
let lazyObserver = null;
let chatBaseUrl = '';
let isLoading = false;
let hasMoreMessages = true;
let currentPage = 0;
let totalMessages = 0;
let isFirstLoad = true;
let scrollTriggerObserver = null;

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function getInitials(name) {
    return name ? name.charAt(0).toUpperCase() : '?';
}

function getChatPreview(messages) {
    if (!messages || messages.length === 0) return 'Sin mensajes';
    const last = messages[messages.length - 1];
    if (!last) return 'Sin mensajes';
    const text = last.mensaje || '';
    if (last.esAdjunto) {
        if (text && text.indexOf('.opus') !== -1) return '🎵 Nota de voz';
        if (text && text.match(/\.(jpg|jpeg|png|gif|webp)/i)) return '🖼️ Imagen';
        if (text && text.match(/\.(mp4|mov|avi|mkv)/i)) return '🎬 Video';
        if (text && text.match(/\.(pdf)/i)) return '📄 PDF';
        return '📎 Archivo adjunto';
    }
    return text.length > 30 ? text.substring(0, 30) + '...' : text;
}

function formatDate(fecha) {
    return fecha || '';
}

function getFileExtension(filename) {
    if (!filename) return '';
    return filename.split('.').pop().toLowerCase();
}

function getFileIcon(ext) {
    const icons = {
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
        '7z': 'fa-file-archive',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image',
        'webp': 'fa-file-image',
        'svg': 'fa-file-image',
        'mp4': 'fa-file-video',
        'mov': 'fa-file-video',
        'avi': 'fa-file-video',
        'mkv': 'fa-file-video',
        'webm': 'fa-file-video',
        'mp3': 'fa-file-audio',
        'wav': 'fa-file-audio',
        'opus': 'fa-file-audio',
        'ogg': 'fa-file-audio',
        'm4a': 'fa-file-audio'
    };
    return icons[ext] || 'fa-file';
}

function getChatBaseUrl(chatName) {
    const base = ORIGIN + '/' + chatName;
    return base.replace(/\/+$/, '');
}

function buildAssetUrl(baseUrl, assetPath) {
    let cleanBase = baseUrl.replace(/\/+$/, '');
    let cleanPath = assetPath.replace(/^\/+/, '');
    let url = cleanBase + '/' + cleanPath;
    url = url.replace(/\/+$/, '');
    return url;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function replaceAssets(text) {
    return text.replace('assets/', '')
}

// ============================================================
// DETECCIÓN DE CHATS
// ============================================================

async function detectChats() {
    console.log('🔍 Detectando chats...');

    try {
        const fullUrl = ORIGIN + '/chats.json';
        console.log(`📄 Buscando chats.json en: ${fullUrl}`);
        const response = await axios.get(fullUrl);
        const data = response.data;
        if (Array.isArray(data) && data.length > 0) {
            console.log('✅ Chats encontrados en chats.json:', data);
            return data;
        }
    } catch (e) {
        console.log('📄 No se encontró chats.json');
    }

    const commonChatNames = [
        'Chat de WhatsApp con Contabilidad Flightepic',
        'Chat de WhatsApp con Contabilidad flightepic',
        'Chat de WhatsApp con Directiva Flight Epic',
        'Chat de WhatsApp con FLIGHTEPIC LLC (AFVP)',
        'Chat de WhatsApp con Finanzas flightepic',
        'Chat de WhatsApp con Gestion Cuenta FlightEpic'
    ];

    const foundChats = [];
    for (const chat of commonChatNames) {
        const testUrl = ORIGIN + '/' + chat + '/data.json';
        try {
            await axios.head(testUrl);
            foundChats.push(chat);
            console.log(`✅ Chat encontrado: ${chat}`);
        } catch (e) {
            // No existe este chat
        }
    }

    if (foundChats.length > 0) {
        return foundChats;
    }

    throw new Error('No se pudo detectar ningún chat');
}

// ============================================================
// CARGA DE CHATS
// ============================================================

async function loadChats() {
    const listEl = document.getElementById('chat-list');

    try {
        chats = await detectChats();

        if (!chats || chats.length === 0) {
            throw new Error('No hay chats disponibles');
        }

        chatBaseUrl = getChatBaseUrl(chats[0]);
        console.log('📍 chatBaseUrl inicial:', chatBaseUrl);

        renderChatList();

        currentChat = chats[0];
        currentPage = 0;
        hasMoreMessages = true;
        isFirstLoad = true;
        await loadChat(currentChat);

    } catch (error) {
        console.error('❌ Error cargando chats:', error);
        listEl.innerHTML = `
            <li style="color:#e9edef;text-align:center;padding:30px;">
                <i class="fas fa-exclamation-triangle" style="color:#e74c3c;"></i>
                <br><br>Error al cargar chats
                <br><span style="font-size:12px;color:#8696a0;">${escapeHtml(error.message)}</span>
                <br><br>
                <button onclick="loadChats()" style="
                    padding: 8px 20px;
                    background: #25d366;
                    border: none;
                    border-radius: 4px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 14px;
                ">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </li>
        `;
    }
}

// ============================================================
// RENDER CHAT LIST
// ============================================================

function renderChatList() {
    const list = document.getElementById('chat-list');
    list.innerHTML = '';

    if (chats.length === 0) {
        list.innerHTML = '<li style="color:#8696a0;text-align:center;padding:30px;">No hay chats</li>';
        return;
    }

    chats.forEach((chat) => {
        const li = document.createElement('li');
        li.className = chat === currentChat ? 'active' : '';
        const messages = messagesCache[chat] || [];
        const preview = getChatPreview(messages);
        const msgCount = messages.length;

        li.innerHTML = `
            <div class="chat-avatar">${getInitials(chat)}</div>
            <div class="chat-info">
                <div class="chat-name">${escapeHtml(chat)}</div>
                <div class="chat-preview">${escapeHtml(preview)}</div>
            </div>
            ${msgCount > 0 ? `<span class="chat-badge">${msgCount}</span>` : ''}
        `;

        li.onclick = async () => {
            currentChat = chat;
            chatBaseUrl = getChatBaseUrl(chat);
            currentPage = 0;
            hasMoreMessages = true;
            isFirstLoad = true;
            renderChatList();
            await loadChat(chat);
        };

        list.appendChild(li);
    });
}

// ============================================================
// CARGA DE MENSAJES CON PAGINACIÓN (hacia arriba)
// ============================================================

async function loadChat(chatName, loadOlder = false) {
    const container = document.getElementById('messages-container');

    if (isLoading) return;
    isLoading = true;

    try {
        chatBaseUrl = getChatBaseUrl(chatName);
        const dataUrl = chatBaseUrl + '/data.json';

        // Si no tenemos los datos en caché o es la primera carga
        if (!messagesCache[chatName] || isFirstLoad) {
            console.log(`📥 Cargando datos desde: ${dataUrl}`);

            // Mostrar indicador de carga
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    Cargando mensajes...
                </div>
            `;

            const response = await axios.get(dataUrl);
            const data = response.data;

            if (!Array.isArray(data)) {
                throw new Error('El formato de data.json no es válido');
            }

            // Guardar todos los datos en caché (ordenados de más antiguo a más nuevo)
            messagesCache[chatName] = data;
            totalMessages = data.length;
            currentPage = 0;
            hasMoreMessages = totalMessages > BLOCK_SIZE;
            isFirstLoad = false;

            // Renderizar primer bloque (los más RECIENTES)
            const startIndex = Math.max(0, totalMessages - BLOCK_SIZE);
            const endIndex = totalMessages;
            const block = data.slice(startIndex, endIndex);

            renderMessagesBlock(block, chatName, false);
            updateHeader(chatName, data);

            // Hacer scroll al final (mensajes más recientes)
            container.scrollTop = container.scrollHeight;

            // Si hay más mensajes antiguos, agregar el trigger de scroll arriba
            if (hasMoreMessages) {
                addScrollTriggerTop();
            }
        } else if (loadOlder && hasMoreMessages) {
            // Cargar mensajes más antiguos
            const data = messagesCache[chatName];
            currentPage++;
            const startIndex = Math.max(0, totalMessages - ((currentPage + 1) * BLOCK_SIZE));
            const endIndex = Math.max(0, totalMessages - (currentPage * BLOCK_SIZE));

            console.log(`📜 Cargando bloque ${currentPage}: ${startIndex} a ${endIndex}`);

            if (startIndex < endIndex && startIndex >= 0) {
                const block = data.slice(startIndex, endIndex);
                const scrollHeightBefore = container.scrollHeight;
                const scrollTopBefore = container.scrollTop;

                // Insertar mensajes al principio
                prependMessagesBlock(block, chatName);

                // Ajustar scroll para mantener la posición
                const scrollHeightAfter = container.scrollHeight;
                const heightDifference = scrollHeightAfter - scrollHeightBefore;
                container.scrollTop = scrollTopBefore + heightDifference;

                // Actualizar estado
                hasMoreMessages = startIndex > 0;
                updateHeader(chatName, data);

                // IMPORTANTE: Remover trigger viejo y agregar uno nuevo si hay más mensajes
                removeScrollTriggerTop();

                if (hasMoreMessages) {
                    addScrollTriggerTop();
                } else {
                    showAllLoadedMessageTop();
                }
            } else {
                // No hay más mensajes
                hasMoreMessages = false;
                removeScrollTriggerTop();
                showAllLoadedMessageTop();
            }
        }

    } catch (error) {
        console.error('❌ Error cargando mensajes:', error);
        if (isFirstLoad) {
            container.innerHTML = `
                <div class="empty-state error">
                    <i class="fas fa-exclamation-triangle"></i>
                    Error al cargar los mensajes
                    <br><span style="font-size:12px;color:#8696a0;margin-top:8px;display:block;">
                        ${escapeHtml(error.message)}
                    </span>
                    <button class="retry-btn" onclick="loadChat('${chatName}')">
                        <i class="fas fa-redo"></i> Reintentar
                    </button>
                </div>
            `;
        }
    } finally {
        isLoading = false;
    }
}

// ============================================================
// RENDER BLOQUE DE MENSAJES (al final)
// ============================================================

function renderMessagesBlock(messages, chatName, append = false) {
    const container = document.getElementById('messages-container');

    if (!messages || messages.length === 0) {
        if (!append) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment-slash"></i>
                    No hay mensajes en este chat
                </div>
            `;
        }
        return;
    }

    const baseUrl = chatBaseUrl;
    let html = '';
    let lastUser = null;

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const isSystem = msg.usuario === 'Sistema';
        const messageClass = isSystem ? 'system' : 'received';
        let showUser = false;

        if (!isSystem && lastUser !== msg.usuario) {
            showUser = true;
            lastUser = msg.usuario;
        }

        const userHtml = showUser && !isSystem ?
            `<div class="msg-user">${escapeHtml(msg.usuario)}</div>` :
            '';

        let adjuntoHtml = '';

        // --- IMÁGENES ---
        if (msg.rutaImagen) {
            const finalUrl = buildAssetUrl(baseUrl, msg.rutaImagen);
            adjuntoHtml = `
                <div class="msg-image" data-lazy-type="image" data-lazy-src="${finalUrl}">
                    <div class="lazy-placeholder">
                        <i class="fas fa-spinner fa-spin"></i> Cargando imagen...
                    </div>
                </div>
            `;
        }
        // --- VIDEOS ---
        else if (msg.rutaVideo) {
            const finalUrl = buildAssetUrl(baseUrl, msg.rutaVideo);
            adjuntoHtml = `
                <div class="msg-video" data-lazy-type="video" data-lazy-src="${finalUrl}">
                    <div class="lazy-placeholder">
                        <i class="fas fa-spinner fa-spin"></i> Cargando video...
                    </div>
                </div>
            `;
        }
        // --- NOTAS DE VOZ ---
        else if (msg.esNotaVoz || (msg.mensaje && msg.mensaje.indexOf('.opus') !== -1)) {
            const audioPath = msg.rutaWav || msg.rutaOpus || '';
            const finalUrl = buildAssetUrl(baseUrl, audioPath);
            const hasTranscription = msg.transcripcion && msg.transcripcion.length > 0;

            adjuntoHtml = `
                <div class="msg-audio" data-lazy-src="${finalUrl}">
                    <div class="audio-controls">
                        <button class="play-btn" onclick="toggleAudio(this)">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="audio-info">
                            <div><i class="fas fa-microphone"></i> Nota de voz ${replaceAssets(msg.rutaWav)}</div>
                            <div class="audio-progress" onclick="seekAudio(event, this)">
                                <div class="progress-bar"></div>
                            </div>
                            <div class="audio-time">
                                <span class="current-time">0:00</span>
                                <span class="duration">0:00</span>
                            </div>
                        </div>
                        <!-- Botón de descarga -->
                        <div class="audio-download-wrapper">
                            <button class="audio-download-btn" onclick="downloadAudio(this, '${finalUrl}')" title="Descargar nota de voz">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>
                    ${hasTranscription ?
                    `<div class="transcription">
                            <div class="transcription-label"><i class="fas fa-file-alt"></i> Transcripción:</div>
                            ${escapeHtml(msg.transcripcion)}
                        </div>` :
                    ''
                }
                </div>
            `;
        }
        // --- PDFs ---
        else if (msg.rutaArchivo && msg.rutaArchivo.toLowerCase().indexOf('.pdf') !== -1) {
            const finalUrl = buildAssetUrl(baseUrl, msg.rutaArchivo);
            adjuntoHtml = `
                <div class="pdf-viewer" data-lazy-type="pdf" data-lazy-src="${finalUrl}">
                    <div class="lazy-placeholder" style="min-height:200px;">
                        <i class="fas fa-spinner fa-spin"></i> Cargando PDF...
                    </div>
                    <div class="pdf-controls">
                        <button onclick="loadPdf(this)">
                            <i class="fas fa-eye"></i> Cargar PDF
                        </button>
                    </div>
                </div>
            `;
        }
        // --- OTROS ARCHIVOS ---
        else if (msg.rutaArchivo || msg.esAdjunto) {
            let filePath = msg.rutaArchivo || '';
            if (!filePath && msg.mensaje) {
                const matchFile = msg.mensaje.match(/([^\s]+\.[^\s]+)/);
                if (matchFile) {
                    filePath = matchFile[1];
                }
            }
            if (filePath) {
                const finalUrl = buildAssetUrl(baseUrl, filePath);
                const fileName = filePath.split('/').pop();
                const ext = getFileExtension(fileName);
                const icon = getFileIcon(ext);
                const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
                const isOffice = officeExtensions.indexOf(ext) !== -1;

                adjuntoHtml = `
                    <a href="${finalUrl}" target="_blank" class="msg-file">
                        <div class="file-icon"><i class="fas ${icon}"></i></div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(fileName)}</div>
                            <div class="file-size">${isOffice ? '📄 Documento Office' : '📎 Archivo'}</div>
                        </div>
                        <div class="file-download"><i class="fas fa-download"></i></div>
                    </a>
                    ${isOffice ?
                        `<div style="margin-top:4px;font-size:12px;color:#8696a0;">
                            <i class="fas fa-info-circle"></i> 
                            <a href="${finalUrl}" target="_blank" style="color:#25d366;text-decoration:none;">
                                Ver en Office Online
                            </a>
                        </div>` : ''
                    }
                `;
            }
        }

        let textContent = '';
        if (!msg.esAdjunto && !msg.rutaImagen && !msg.rutaVideo) {
            textContent = `<div class="msg-text">${escapeHtml(msg.mensaje || '')}</div>`;
        }

        html += `
            <div class="message ${messageClass}">
                ${userHtml}
                ${textContent}
                ${adjuntoHtml}
                <div class="msg-time">${formatDate(msg.fecha)}</div>
            </div>
        `;
    }

    if (append) {
        // Insertar al final
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        while (tempDiv.firstChild) {
            container.appendChild(tempDiv.firstChild);
        }
    } else {
        container.innerHTML = html;
    }

    // Inicializar lazy loading para los nuevos elementos
    initLazyLoader();
}

// ============================================================
// PREPEND BLOQUE DE MENSAJES (al principio - mensajes más antiguos)
// ============================================================

function prependMessagesBlock(messages, chatName) {
    const container = document.getElementById('messages-container');

    if (!messages || messages.length === 0) return;

    const baseUrl = chatBaseUrl;
    let html = '';
    let lastUser = null;

    // Determinar el primer usuario del bloque
    if (messages.length > 0) {
        const firstMsg = messages[0];
        if (firstMsg && firstMsg.usuario !== 'Sistema') {
            lastUser = firstMsg.usuario;
        }
    }

    // Construir mensajes en orden (ya están en orden cronológico)
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const isSystem = msg.usuario === 'Sistema';
        const messageClass = isSystem ? 'system' : 'received';
        let showUser = false;

        if (!isSystem && lastUser !== msg.usuario) {
            showUser = true;
            lastUser = msg.usuario;
        }

        const userHtml = showUser && !isSystem ?
            `<div class="msg-user">${escapeHtml(msg.usuario)}</div>` :
            '';

        let adjuntoHtml = '';

        // --- IMÁGENES ---
        if (msg.rutaImagen) {
            const finalUrl = buildAssetUrl(baseUrl, msg.rutaImagen);
            adjuntoHtml = `
                <div class="msg-image" data-lazy-type="image" data-lazy-src="${finalUrl}">
                    <div class="lazy-placeholder">
                        <i class="fas fa-spinner fa-spin"></i> Cargando imagen...
                    </div>
                </div>
            `;
        }
        // --- VIDEOS ---
        else if (msg.rutaVideo) {
            const finalUrl = buildAssetUrl(baseUrl, msg.rutaVideo);
            adjuntoHtml = `
                <div class="msg-video" data-lazy-type="video" data-lazy-src="${finalUrl}">
                    <div class="lazy-placeholder">
                        <i class="fas fa-spinner fa-spin"></i> Cargando video...
                    </div>
                </div>
            `;
        }
        // --- NOTAS DE VOZ ---
        else if (msg.esNotaVoz || (msg.mensaje && msg.mensaje.indexOf('.opus') !== -1)) {
            const audioPath = msg.rutaWav || msg.rutaOpus || '';
            const finalUrl = buildAssetUrl(baseUrl, audioPath);
            const hasTranscription = msg.transcripcion && msg.transcripcion.length > 0;

            adjuntoHtml = `
                <div class="msg-audio" data-lazy-src="${finalUrl}">
                    <div class="audio-controls">
                        <button class="play-btn" onclick="toggleAudio(this)">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="audio-info">
                            <div><i class="fas fa-microphone"></i> Nota de voz ${replaceAssets(msg.rutaWav)}</div>
                            <div class="audio-progress" onclick="seekAudio(event, this)">
                                <div class="progress-bar"></div>
                            </div>
                            <div class="audio-time">
                                <span class="current-time">0:00</span>
                                <span class="duration">0:00</span>
                            </div>
                        </div>
                        <!-- Botón de descarga -->
                        <div class="audio-download-wrapper">
                            <button class="audio-download-btn" onclick="downloadAudio(this, '${finalUrl}')" title="Descargar nota de voz">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>
                    ${hasTranscription ?
                    `<div class="transcription">
                            <div class="transcription-label"><i class="fas fa-file-alt"></i> Transcripción:</div>
                            ${escapeHtml(msg.transcripcion)}
                        </div>` :
                    ''
                }
                </div>
            `;
        }
        // --- PDFs ---
        else if (msg.rutaArchivo && msg.rutaArchivo.toLowerCase().indexOf('.pdf') !== -1) {
            const finalUrl = buildAssetUrl(baseUrl, msg.rutaArchivo);
            adjuntoHtml = `
                <div class="pdf-viewer" data-lazy-type="pdf" data-lazy-src="${finalUrl}">
                    <div class="lazy-placeholder" style="min-height:200px;">
                        <i class="fas fa-spinner fa-spin"></i> Cargando PDF...
                    </div>
                    <div class="pdf-controls">
                        <button onclick="loadPdf(this)">
                            <i class="fas fa-eye"></i> Cargar PDF
                        </button>
                    </div>
                </div>
            `;
        }
        // --- OTROS ARCHIVOS ---
        else if (msg.rutaArchivo || msg.esAdjunto) {
            let filePath = msg.rutaArchivo || '';
            if (!filePath && msg.mensaje) {
                const matchFile = msg.mensaje.match(/([^\s]+\.[^\s]+)/);
                if (matchFile) {
                    filePath = matchFile[1];
                }
            }
            if (filePath) {
                const finalUrl = buildAssetUrl(baseUrl, filePath);
                const fileName = filePath.split('/').pop();
                const ext = getFileExtension(fileName);
                const icon = getFileIcon(ext);
                const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
                const isOffice = officeExtensions.indexOf(ext) !== -1;

                adjuntoHtml = `
                    <a href="${finalUrl}" target="_blank" class="msg-file">
                        <div class="file-icon"><i class="fas ${icon}"></i></div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(fileName)}</div>
                            <div class="file-size">${isOffice ? '📄 Documento Office' : '📎 Archivo'}</div>
                        </div>
                        <div class="file-download"><i class="fas fa-download"></i></div>
                    </a>
                    ${isOffice ?
                        `<div style="margin-top:4px;font-size:12px;color:#8696a0;">
                            <i class="fas fa-info-circle"></i> 
                            <a href="${finalUrl}" target="_blank" style="color:#25d366;text-decoration:none;">
                                Ver en Office Online
                            </a>
                        </div>` : ''
                    }
                `;
            }
        }

        let textContent = '';
        if (!msg.esAdjunto && !msg.rutaImagen && !msg.rutaVideo) {
            textContent = `<div class="msg-text">${escapeHtml(msg.mensaje || '')}</div>`;
        }

        html += `
            <div class="message ${messageClass}">
                ${userHtml}
                ${textContent}
                ${adjuntoHtml}
                <div class="msg-time">${formatDate(msg.fecha)}</div>
            </div>
        `;
    }

    // Insertar al principio
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const fragment = document.createDocumentFragment();
    while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
    }
    container.insertBefore(fragment, container.firstChild);

    // Inicializar lazy loading para los nuevos elementos
    initLazyLoader();
}

// ============================================================
// SCROLL TRIGGER PARA CARGAR MÁS ANTIGUOS (arriba) - CORREGIDO
// ============================================================

function addScrollTriggerTop() {
    // Remover trigger existente
    removeScrollTriggerTop();

    const container = document.getElementById('messages-container');

    // Verificar si ya hay un trigger
    if (document.getElementById('scroll-trigger-top')) {
        return;
    }

    // Crear elemento de carga al inicio
    const trigger = document.createElement('div');
    trigger.id = 'scroll-trigger-top';
    trigger.className = 'scroll-trigger-top';
    trigger.innerHTML = `
        <div style="text-align:center;padding:20px;color:#8696a0;background: rgba(0,0,0,0.05);border-radius: 8px;margin: 10px 0;">
            <i class="fas fa-chevron-up"></i> 
            <span id="trigger-text">Cargar mensajes más antiguos</span>
            <div style="font-size:12px;margin-top:5px;">
                <i class="fas fa-spinner fa-spin" style="display:none;" id="loading-spinner-top"></i>
            </div>
        </div>
    `;

    // Insertar al principio
    container.insertBefore(trigger, container.firstChild);

    // Crear nuevo observer para este trigger
    if (scrollTriggerObserver) {
        scrollTriggerObserver.disconnect();
    }

    scrollTriggerObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoading && hasMoreMessages) {
                console.log('📜 Trigger visible - Cargando más mensajes antiguos...');
                // Mostrar spinner
                const spinner = document.getElementById('loading-spinner-top');
                const text = document.getElementById('trigger-text');
                if (spinner) spinner.style.display = 'inline-block';
                if (text) text.textContent = 'Cargando...';

                loadChat(currentChat, true).finally(() => {
                    // El trigger se recrea en loadChat, así que no necesitamos ocultar el spinner aquí
                });
            }
        });
    }, {
        root: container,
        rootMargin: '0px 0px 0px 0px',
        threshold: 0.1
    });

    scrollTriggerObserver.observe(trigger);
}

function removeScrollTriggerTop() {
    const trigger = document.getElementById('scroll-trigger-top');
    if (trigger) {
        trigger.remove();
    }
    if (scrollTriggerObserver) {
        scrollTriggerObserver.disconnect();
        scrollTriggerObserver = null;
    }
}

function showAllLoadedMessageTop() {
    // Remover trigger primero
    removeScrollTriggerTop();

    const container = document.getElementById('messages-container');

    // Verificar si ya existe el mensaje
    if (document.getElementById('all-loaded-message')) {
        return;
    }

    const message = document.createElement('div');
    message.id = 'all-loaded-message';
    message.style.cssText = `
        text-align: center;
        padding: 20px;
        color: #8696a0;
        font-size: 14px;
        border-bottom: 1px solid rgba(134, 150, 160, 0.2);
        margin-bottom: 10px;
        background: rgba(37, 211, 102, 0.05);
        border-radius: 8px;
    `;
    message.innerHTML = `
        <i class="fas fa-check-circle" style="color:#25d366;"></i>
        Todos los mensajes cargados (${totalMessages} mensajes)
    `;
    container.insertBefore(message, container.firstChild);
}

// ============================================================
// UPDATE HEADER
// ============================================================

function updateHeader(chatName, messages) {
    document.getElementById('chat-name').textContent = chatName || 'Chat';
    document.getElementById('chat-avatar').textContent = getInitials(chatName);
    const count = messages ? messages.length : 0;
    const loaded = Math.min(((currentPage + 1) * BLOCK_SIZE), count);
    document.getElementById('chat-status').textContent = `${loaded}/${count} mensajes`;
}

// ============================================================
// LAZY LOADING DE MEDIA
// ============================================================

function initLazyLoader() {
    if (lazyObserver) {
        lazyObserver.disconnect();
    }

    lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const type = el.dataset.lazyType;
                const src = el.dataset.lazySrc;

                if (type === 'image') {
                    loadLazyImage(el, src);
                } else if (type === 'video') {
                    loadLazyVideo(el, src);
                }

                lazyObserver.unobserve(el);
            }
        });
    }, {
        rootMargin: '200px',
        threshold: 0.1
    });

    document.querySelectorAll('[data-lazy-type]').forEach(el => {
        lazyObserver.observe(el);
    });
}

function loadLazyImage(container, src) {
    let cleanSrc = src.replace(/\/+$/, '');
    cleanSrc = cleanSrc.replace(/%20/g, ' ');

    console.log('🖼️ Cargando imagen:', cleanSrc);

    const img = document.createElement('img');
    img.src = cleanSrc;
    img.alt = 'Imagen';
    img.loading = 'lazy';

    img.onerror = function () {
        console.error('❌ Error cargando imagen:', cleanSrc);
        container.innerHTML = `
            <div class="lazy-placeholder error">
                <i class="fas fa-exclamation-circle"></i> Error al cargar imagen
                <br><span style="font-size:11px;word-break:break-all;">${cleanSrc}</span>
            </div>
        `;
    };

    img.onload = function () {
        console.log('✅ Imagen cargada correctamente');
    };

    img.onclick = function () {
        openLightbox(this.src, 'Imagen');
    };

    container.innerHTML = '';
    container.appendChild(img);
}

function loadLazyVideo(container, src) {
    let cleanSrc = src.replace(/\/+$/, '').replace(/%20/g, ' ');

    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.onerror = function () {
        container.innerHTML = `
            <div class="lazy-placeholder error">
                <i class="fas fa-exclamation-circle"></i> Error al cargar video
            </div>
        `;
    };
    const source = document.createElement('source');
    source.src = cleanSrc;
    source.type = 'video/mp4';
    video.appendChild(source);
    container.innerHTML = '';
    container.appendChild(video);
}

// ============================================================
// FUNCIONES PARA PDF
// ============================================================

function loadPdf(btn) {
    const container = btn.closest('.pdf-viewer');
    if (!container) return;

    let src = container.dataset.lazySrc;
    if (!src) {
        alert('No se encontró el archivo PDF');
        return;
    }

    src = src.replace(/\/+$/, '').replace(/%20/g, ' ');

    const placeholder = container.querySelector('.lazy-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    const oldControls = container.querySelector('.pdf-controls');
    if (oldControls) {
        oldControls.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.src = src + '#toolbar=0';
    iframe.title = 'PDF Viewer';
    container.prepend(iframe);

    const controls = document.createElement('div');
    controls.className = 'pdf-controls';
    controls.innerHTML = `
        <button onclick="window.open('${src}', '_blank')">
            <i class="fas fa-external-link-alt"></i> Abrir en nueva ventana
        </button>
        <a href="${src}" download>
            <i class="fas fa-download"></i> Descargar PDF
        </a>
    `;
    container.appendChild(controls);

    if (lazyObserver) {
        lazyObserver.unobserve(container);
    }
}

// ============================================================
// FUNCIONES DE AUDIO
// ============================================================

function toggleAudio(btn) {
    const container = btn.closest('.msg-audio');
    if (!container) return;

    let audioSrc = container.dataset.lazySrc;
    if (!audioSrc) {
        alert('No se encontró el archivo de audio');
        return;
    }

    audioSrc = audioSrc.replace(/\/+$/, '').replace(/%20/g, ' ');

    let audio = container.querySelector('audio');
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'audio-player-' + Date.now();
        audio.src = audioSrc;
        audio.preload = 'metadata';
        container.appendChild(audio);

        audio.addEventListener('loadedmetadata', function () {
            const durationDisplay = this.closest('.msg-audio').querySelector('.duration');
            if (durationDisplay) {
                const minutes = Math.floor(this.duration / 60);
                const seconds = Math.floor(this.duration % 60);
                durationDisplay.textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
            }
        });

        audio.addEventListener('timeupdate', function () {
            updateAudioProgress(this);
        });

        audio.addEventListener('ended', function () {
            const playBtn = this.closest('.msg-audio').querySelector('.play-btn');
            if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
            const progressBar = this.closest('.msg-audio').querySelector('.progress-bar');
            if (progressBar) progressBar.style.width = '0%';
            const currentTime = this.closest('.msg-audio').querySelector('.current-time');
            if (currentTime) currentTime.textContent = '0:00';
        });

        audio.addEventListener('error', function () {
            const playBtn = this.closest('.msg-audio').querySelector('.play-btn');
            if (playBtn) {
                playBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                playBtn.classList.add('error');
            }
        });
    }

    if (!audio.paused) {
        audio.pause();
        btn.innerHTML = '<i class="fas fa-play"></i>';
        return;
    }

    audio.play();
    btn.innerHTML = '<i class="fas fa-pause"></i>';
}

function updateAudioProgress(audio) {
    const container = audio.closest('.msg-audio');
    if (!container) return;
    const progressBar = container.querySelector('.progress-bar');
    const currentTime = container.querySelector('.current-time');

    if (progressBar && audio.duration) {
        const progress = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = progress + '%';
    }

    if (currentTime) {
        const minutes = Math.floor(audio.currentTime / 60);
        const seconds = Math.floor(audio.currentTime % 60);
        currentTime.textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    }
}

function seekAudio(event, progressContainer) {
    const container = progressContainer.closest('.msg-audio');
    const audio = container.querySelector('audio');
    if (!audio || !audio.src || !audio.duration) return;

    const rect = progressContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = percentage * audio.duration;
}

// ============================================================
// FUNCIÓN DE DESCARGA DE NOTAS DE VOZ (NUEVA)
// ============================================================

function downloadAudio(btn, audioUrl) {
    // Limpiar la URL
    let cleanUrl = audioUrl.replace(/\/+$/, '').replace(/%20/g, ' ');

    // Mostrar feedback visual en el botón
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    // Extraer el nombre del archivo de la URL
    const fileName = cleanUrl.split('/').pop() || 'nota-voz.opus';

    // Usar fetch para obtener el archivo y luego descargarlo
    fetch(cleanUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            // Crear URL para el blob
            const blobUrl = URL.createObjectURL(blob);

            // Crear elemento de descarga
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Limpiar URL del blob después de un momento
            setTimeout(() => {
                URL.revokeObjectURL(blobUrl);
            }, 100);

            // Restaurar el botón
            btn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }, 2000);
        })
        .catch(error => {
            console.error('Error al descargar el audio:', error);

            // Si el fetch falla, intentar con el método alternativo (abrir en nueva pestaña)
            try {
                const link = document.createElement('a');
                link.href = cleanUrl;
                link.download = fileName;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                btn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                }, 2000);
            } catch (fallbackError) {
                alert('No se pudo descargar el archivo. Intenta abrirlo directamente: ' + cleanUrl);
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        });
}

// ============================================================
// LIGHTBOX
// ============================================================

function openLightbox(src, caption) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    const captionEl = document.getElementById('lightbox-caption');

    const allImages = document.querySelectorAll('.msg-image img');
    lightboxImages = [];
    for (let i = 0; i < allImages.length; i++) {
        lightboxImages.push(allImages[i].src);
    }

    lightboxIndex = lightboxImages.indexOf(src);
    if (lightboxIndex === -1) {
        lightboxIndex = 0;
        lightboxImages = [src];
    }

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

    const img = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    img.src = lightboxImages[lightboxIndex];

    const imgElement = document.querySelector('img[src="' + lightboxImages[lightboxIndex] + '"]');
    if (imgElement) {
        const parent = imgElement.closest('.msg-image');
        if (parent) {
            const user = parent.closest('.message').querySelector('.msg-user');
            caption.textContent = user ? user.textContent : 'Imagen';
        }
    }
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
});

// ============================================================
// EXPONER FUNCIONES GLOBALES
// ============================================================

window.loadChats = loadChats;
window.loadChat = loadChat;
window.loadPdf = loadPdf;
window.toggleAudio = toggleAudio;
window.seekAudio = seekAudio;
window.downloadAudio = downloadAudio; // Exponer nueva función
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.navigateLightbox = navigateLightbox;

// ============================================================
// INICIALIZACIÓN
// ============================================================

console.log('📱 WhatsApp Chat Viewer - Versión con carga diferida hacia arriba');
console.log('📍 Origen:', ORIGIN);
console.log(`📦 Tamaño de bloque: ${BLOCK_SIZE} mensajes`);

loadChats();