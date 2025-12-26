/**
 * Photo Report Application
 * Main Application Logic - With IndexedDB Storage and Fixed PDF Generation
 */

// ================================
// IndexedDB Database Layer (Unlimited Storage)
// ================================
const DB_NAME = 'PhotoReportAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

let db = null;

async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Error opening IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('savedAt', 'savedAt', { unique: false });
            }
        };
    });
}

async function saveReportToDB(reportData) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(reportData);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

async function getAllReportsFromDB() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getReportFromDB(reportId) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(reportId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteReportFromDB(reportId) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(reportId);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// ================================
// Global State
// ================================
const state = {
    photos: [],
    groups: {},
    processedFiles: new Set()
};

// ================================
// Initialize Application
// ================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize IndexedDB first
    try {
        await initDatabase();
        console.log('IndexedDB initialized successfully');
    } catch (error) {
        console.error('Failed to initialize IndexedDB:', error);
    }

    initializeApp();
});

function initializeApp() {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('report-date').value = today;

    // Setup file inputs
    setupFileInputs();

    // Setup drag and drop
    setupDragAndDrop();
}

/**
 * Setup file input listeners
 */
function setupFileInputs() {
    const mainFileInput = document.getElementById('file-input');
    const additionalFileInput = document.getElementById('additional-files');

    // Remove existing listeners by replacing with clone
    const newMainInput = mainFileInput.cloneNode(true);
    mainFileInput.parentNode.replaceChild(newMainInput, mainFileInput);

    const newAdditionalInput = additionalFileInput.cloneNode(true);
    additionalFileInput.parentNode.replaceChild(newAdditionalInput, additionalFileInput);

    // Add listeners to the new inputs
    newMainInput.addEventListener('change', function(e) {
        handleFiles(this.files);
        // Reset input value after processing
        setTimeout(() => { this.value = ''; }, 100);
    });

    newAdditionalInput.addEventListener('change', function(e) {
        handleFiles(this.files);
        // Reset input value after processing
        setTimeout(() => { this.value = ''; }, 100);
    });

    // Store references for drag and drop
    window.fileInput = newMainInput;
    window.additionalInput = newAdditionalInput;
}

/**
 * Setup drag and drop functionality
 */
function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = window.fileInput || document.getElementById('file-input');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handleFiles(files);
    });

    // Click on dropzone opens file dialog
    let lastClickTime = 0;
    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL' || e.target.closest('label')) return;

        const currentTime = Date.now();
        if (currentTime - lastClickTime < 300) return;
        lastClickTime = currentTime;

        if (fileInput) {
            fileInput.click();
        }
    });
}

/**
 * Reset file input to allow re-selecting files
 */
function resetFileInput(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.value = '';
        state.processedFiles.clear();
    }
}

// ================================
// File Handling
// ================================

/**
 * Convert a file to base64 data URL
 * @param {File} file - The file to convert
 * @returns {Promise<string>} - Base64 data URL
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

/**
 * Handle uploaded files
 * @param {FileList} files - Array of uploaded files
 */
async function handleFiles(files) {
    if (!files || files.length === 0) return;

    // Show progress
    document.getElementById('upload-section').classList.remove('hidden');
    document.getElementById('upload-progress').classList.remove('hidden');

    const validFiles = Array.from(files).filter(file =>
        file.type.match(/image\/(jpeg|jpg|png)/i)
    );

    if (validFiles.length === 0) {
        alert('No se encontraron imágenes válidas. Por favor, sube archivos JPG, JPEG o PNG.');
        document.getElementById('upload-progress').classList.add('hidden');
        return;
    }

    const total = validFiles.length;
    let processed = 0;

    // Process each file
    for (const file of validFiles) {
        const fileId = file.name + '_' + file.size + '_' + file.lastModified;

        if (state.processedFiles.has(fileId)) {
            console.log('Skipping duplicate file:', file.name);
            continue;
        }

        try {
            state.processedFiles.add(fileId);

            // Compress image first to reduce size
            const compressedFile = await compressImage(file);

            // Convert to base64 for display and storage
            const base64Data = await fileToBase64(compressedFile);

            // Create object URL for immediate display
            const objectUrl = URL.createObjectURL(compressedFile);

            // Add to state - store base64Data for PDF generation
            state.photos.push({
                id: generateUniqueId(),
                originalName: file.name,
                compressedFile: compressedFile,
                objectUrl: objectUrl,
                base64Data: base64Data,
                group: extractGroupName(file.name)
            });

            processed++;
            updateProgress(processed, total);

        } catch (error) {
            console.error('Error processing file:', file.name, error);
            state.processedFiles.delete(fileId);
        }
    }

    // Complete
    setTimeout(() => {
        document.getElementById('upload-progress').classList.add('hidden');
        if (state.photos.length > 0) {
            groupPhotos();
            renderDashboard();
        }
        resetFileInput('file-input');
    }, 500);
}

/**
 * Compress image to reduce file size and dimensions
 * @param {File} file - Original image file
 * @returns {Promise<File>} - Compressed image file
 */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const options = {
            quality: 0.7,
            maxWidth: 1000,
            maxHeight: 1000,
            strict: false,
            success(result) {
                resolve(result);
            },
            error(error) {
                reject(error);
            }
        };

        new Compressor(file, options);
    });
}

/**
 * Update upload progress bar
 * @param {number} current - Current progress
 * @param {number} total - Total files
 */
function updateProgress(current, total) {
    const percentage = (current / total) * 100;
    const progressFill = document.getElementById('progress-fill');
    const progressCount = document.getElementById('progress-count');
    if (progressFill) progressFill.style.width = percentage + '%';
    if (progressCount) progressCount.textContent = `${current}/${total}`;
}

// ================================
// Photo Grouping Logic
// ================================

/**
 * Extract group name from filename
 * @param {string} filename - The filename to process
 * @returns {string} - The group name (base ID)
 */
function extractGroupName(filename) {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const upperName = nameWithoutExt.toUpperCase();
    const groupPattern = /^([A-Z0-9]+)/;
    const match = upperName.match(groupPattern);

    if (match) {
        return match[1];
    }
    return upperName;
}

/**
 * Group photos by their group name
 */
function groupPhotos() {
    state.groups = {};

    for (const photo of state.photos) {
        const groupName = photo.group;
        if (!state.groups[groupName]) {
            state.groups[groupName] = [];
        }
        state.groups[groupName].push(photo);
    }

    // Sort photos within each group
    for (const groupName in state.groups) {
        state.groups[groupName].sort((a, b) => {
            return a.originalName.localeCompare(b.originalName, undefined, { numeric: true });
        });
    }

    // Sort groups
    const sortedGroups = {};
    Object.keys(state.groups).sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''));
        const numB = parseInt(b.replace(/[^0-9]/g, ''));
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
            return numA - numB;
        }
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }).forEach(key => {
        sortedGroups[key] = state.groups[key];
    });

    state.groups = sortedGroups;
}

// ================================
// Dashboard Rendering
// ================================

/**
 * Render the dashboard with photo groups
 */
function renderDashboard() {
    const uploadSection = document.getElementById('upload-section');
    const dashboardSection = document.getElementById('dashboard-section');

    uploadSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    renderGroups();
    updateCounts();
}

/**
 * Render all photo groups
 */
function renderGroups() {
    const groupsList = document.getElementById('groups-list');
    if (!groupsList) return;

    groupsList.innerHTML = '';

    const groupNames = Object.keys(state.groups);

    if (groupNames.length === 0) {
        groupsList.innerHTML = `
            <div class="group-card">
                <div class="group-header" style="background: var(--text-muted);">
                    <span class="group-title">Sin fotografías</span>
                </div>
                <div class="group-photos" style="text-align: center; color: var(--text-secondary);">
                    <p style="grid-column: 1/-1; padding: 40px;">No hay fotografías para mostrar.</p>
                </div>
            </div>
        `;
        return;
    }

    groupNames.forEach(groupName => {
        const photos = state.groups[groupName];
        const groupCard = createGroupCard(groupName, photos);
        groupsList.appendChild(groupCard);
    });
}

/**
 * Create a group card element
 * @param {string} groupName - Name of the group
 * @param {Array} photos - Array of photos in the group
 * @returns {HTMLElement} - The group card element
 */
function createGroupCard(groupName, photos) {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.dataset.group = groupName;

    card.innerHTML = `
        <div class="group-header">
            <span class="group-title">${groupName}</span>
            <span class="group-photos-count">${photos.length} fotografía${photos.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="group-photos">
            ${photos.map(photo => createPhotoItem(photo)).join('')}
        </div>
    `;

    return card;
}

/**
 * Create a photo item element
 * @param {Object} photo - Photo object
 * @returns {string} - HTML string for the photo item
 */
function createPhotoItem(photo) {
    return `
        <div class="photo-item" data-photo-id="${photo.id}">
            <img src="${photo.objectUrl}" alt="${photo.originalName}" loading="lazy">
            <span class="photo-name">${photo.originalName}</span>
            <button class="remove-photo" onclick="removePhoto('${photo.id}')" title="Eliminar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `;
}

/**
 * Remove a photo from the state
 * @param {string} photoId - ID of the photo to remove
 */
function removePhoto(photoId) {
    const photoIndex = state.photos.findIndex(p => p.id === photoId);

    if (photoIndex > -1) {
        URL.revokeObjectURL(state.photos[photoIndex].objectUrl);
        state.photos.splice(photoIndex, 1);
        groupPhotos();
        renderDashboard();
    }
}

/**
 * Update photo and group counts
 */
function updateCounts() {
    const groupCount = Object.keys(state.groups).length;
    const photoCount = state.photos.length;

    const groupCountEl = document.getElementById('group-count');
    const totalPhotosEl = document.getElementById('total-photos');

    if (groupCountEl) groupCountEl.textContent = groupCount;
    if (totalPhotosEl) totalPhotosEl.textContent = `${photoCount} fotografía${photoCount !== 1 ? 's' : ''} en total`;
}

// ================================
// Save/Load System (IndexedDB - Unlimited Storage)
// ================================

/**
 * Save current report to IndexedDB (unlimited storage)
 */
async function saveReport() {
    if (state.photos.length === 0) {
        alert('No hay fotografías para guardar.');
        return;
    }

    const reportTitle = document.getElementById('report-title').value || 'Reporte sin título';
    const reportCode = document.getElementById('report-code').value || '';

    // Create unique report ID
    const reportId = 'report_' + Date.now();

    // Prepare report data - store base64Data directly
    const photosToSave = state.photos.map(photo => ({
        id: photo.id,
        originalName: photo.originalName,
        group: photo.group,
        // Store base64 data directly - IndexedDB can handle large objects
        imageData: photo.base64Data
    }));

    const reportData = {
        id: reportId,
        title: reportTitle,
        code: reportCode,
        author: document.getElementById('report-author').value || '',
        date: document.getElementById('report-date').value || new Date().toISOString().split('T')[0],
        photos: photosToSave,
        savedAt: new Date().toISOString()
    };

    try {
        await saveReportToDB(reportData);
        showNotification('Reporte guardado correctamente');

    } catch (error) {
        console.error('Error saving report:', error);
        alert('Error al guardar el reporte: ' + error.message);
    }
}

/**
 * Load a saved report from IndexedDB
 * @param {string} reportId - ID of the report to load
 */
async function loadReport(reportId) {
    try {
        const report = await getReportFromDB(reportId);

        if (!report) {
            alert('Reporte no encontrado.');
            return;
        }

        // Clear current state
        for (const photo of state.photos) {
            URL.revokeObjectURL(photo.objectUrl);
        }
        state.photos = [];
        state.groups = {};
        state.processedFiles.clear();

        // Load photos from saved report
        for (const savedPhoto of report.photos) {
            // Create object URL from stored base64 data
            const objectUrl = dataURLtoBlob(savedPhoto.imageData);

            state.photos.push({
                id: savedPhoto.id,
                originalName: savedPhoto.originalName,
                compressedFile: null,
                objectUrl: objectUrl,
                base64Data: savedPhoto.imageData,
                group: savedPhoto.group
            });
        }

        // Regroup and render
        groupPhotos();
        renderDashboard();

        // Fill form fields
        document.getElementById('report-title').value = report.title || 'REPORTE DE FOTOS';
        document.getElementById('report-code').value = report.code || '';
        document.getElementById('report-author').value = report.author || '';
        document.getElementById('report-date').value = report.date || new Date().toISOString().split('T')[0];

        // Close modal
        closeSavedReportsModal();

        showNotification('Reporte cargado correctamente');

    } catch (error) {
        console.error('Error loading report:', error);
        alert('Error al cargar el reporte: ' + error.message);
    }
}

/**
 * Show saved reports modal
 */
async function showSavedReports() {
    const modal = document.getElementById('saved-reports-modal');
    const list = document.getElementById('saved-reports-list');
    const noReportsMsg = document.getElementById('no-reports-message');

    if (!modal || !list) return;

    try {
        const savedReports = await getAllReportsFromDB();

        list.innerHTML = '';

        if (!savedReports || savedReports.length === 0) {
            list.style.display = 'none';
            if (noReportsMsg) noReportsMsg.style.display = 'block';
        } else {
            if (noReportsMsg) noReportsMsg.style.display = 'none';
            list.style.display = 'grid';

            // Sort by date (newest first)
            savedReports.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

            savedReports.forEach(report => {
                const reportItem = document.createElement('div');
                reportItem.className = 'saved-report-item';
                reportItem.innerHTML = `
                    <div class="report-info">
                        <h4>${report.title}</h4>
                        <p>${report.code ? 'Ref: ' + report.code : ''} | ${report.photos.length} fotos | ${formatDateSimple(report.savedAt)}</p>
                    </div>
                    <div class="report-actions">
                        <button class="btn-load-report" onclick="loadReport('${report.id}')">Cargar</button>
                        <button class="btn-delete-report" onclick="deleteReport('${report.id}')">Eliminar</button>
                    </div>
                `;
                list.appendChild(reportItem);
            });
        }

        modal.classList.remove('hidden');

    } catch (error) {
        console.error('Error showing saved reports:', error);
        alert('Error al mostrar reportes guardados: ' + error.message);
    }
}

/**
 * Delete a saved report from IndexedDB
 * @param {string} reportId - ID of the report to delete
 */
async function deleteReport(reportId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este reporte?')) {
        return;
    }

    try {
        await deleteReportFromDB(reportId);
        showSavedReports();
        showNotification('Reporte eliminado');

    } catch (error) {
        console.error('Error deleting report:', error);
        alert('Error al eliminar el reporte: ' + error.message);
    }
}

/**
 * Close saved reports modal
 */
function closeSavedReportsModal() {
    const modal = document.getElementById('saved-reports-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Show notification message
 * @param {string} message - Message to display
 */
function showNotification(message) {
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #10b981;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

/**
 * Convert data URL to Blob URL
 * @param {string} dataURL - Base64 data URL
 * @returns {string} - Blob URL
 */
function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return URL.createObjectURL(new Blob([u8arr], { type: mime }));
}

/**
 * Format date simple
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDateSimple(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ================================
// PDF Generation - FIXED with proper pagination
// ================================

/**
 * Generate PDF report with ALL photos
 */
async function generatePDF() {
    if (state.photos.length === 0) {
        alert('Por favor, añade al menos una fotografía antes de generar el reporte.');
        return;
    }

    const modal = document.getElementById('generating-modal');
    const progressFill = document.getElementById('pdf-progress');
    const statusText = document.getElementById('pdf-status');

    if (!modal || !progressFill || !statusText) {
        console.error('PDF generation modal elements not found');
        alert('Error: Elementos de la interfaz no encontrados. Recarga la página.');
        return;
    }

    modal.classList.remove('hidden');
    progressFill.style.width = '0%';
    statusText.textContent = 'Inicializando...';

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 15;
        const contentWidth = pageWidth - (margin * 2);
        let currentY = margin;
        let currentPage = 1;

        const addFooterAndWatermark = (pageNum, total, includeWatermark = true) => {
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'normal');
            doc.text(`Página ${pageNum} de ${total}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
        };

        const addPage = () => {
            doc.addPage();
            currentY = margin;
            currentPage++;
        };

        const checkPageBreak = (requiredHeight) => {
            const availableSpace = pageHeight - margin - 20;

            if (currentY + requiredHeight > availableSpace) {
                addPage();
                return true;
            }
            return false;
        };

        statusText.textContent = 'Cargando logos...';
        progressFill.style.width = '5%';

        const [logoElecnor, logoLyntia, logoRedes] = await Promise.all([
            loadImageAsBase64('assets/logo-elecnor.png'),
            loadImageAsBase64('assets/logo-lyntia.png', 'image/png'),
            loadImageAsBase64('assets/logo-redes.png')
        ]);

        // ================================
        // COVER PAGE
        // ================================
        statusText.textContent = 'Creando portada...';
        progressFill.style.width = '10%';

        const reportTitle = document.getElementById('report-title').value || 'REPORTE DE FOTOS';
        const reportCode = document.getElementById('report-code').value || '';
        const reportAuthor = document.getElementById('report-author').value || '';
        const reportDate = document.getElementById('report-date').value;

        const coverLogoHeight = 35;
        const coverLogoWidth = 60;

        const elecnorX = 30;
        const lyntiaX = (pageWidth - coverLogoWidth) / 2;
        const redesX = pageWidth - 30 - coverLogoWidth;
        const logoY = 50;

        if (logoElecnor) {
            doc.addImage(logoElecnor, 'PNG', elecnorX, logoY, coverLogoWidth, coverLogoHeight, undefined, 'FAST');
        }
        if (logoLyntia) {
            doc.addImage(logoLyntia, 'PNG', lyntiaX, logoY, coverLogoWidth, coverLogoHeight, undefined, 'FAST');
        }
        if (logoRedes) {
            doc.addImage(logoRedes, 'PNG', redesX, logoY, coverLogoWidth, coverLogoHeight, undefined, 'FAST');
        }

        currentY = logoY + coverLogoHeight + 20;

        doc.setFontSize(28);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 86, 179);

        const titleLines = doc.splitTextToSize(reportTitle, contentWidth);
        doc.text(titleLines, pageWidth / 2, currentY, { align: 'center' });
        currentY += titleLines.length * 12 + 15;

        if (reportCode) {
            doc.setFontSize(18);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'normal');
            doc.text(`Referencia: ${reportCode}`, pageWidth / 2, currentY, { align: 'center' });
            currentY += 15;
        }

        doc.setDrawColor(0, 86, 179);
        doc.setLineWidth(0.5);
        doc.line(margin + 20, currentY, pageWidth - margin - 20, currentY);
        currentY += 20;

        doc.setFontSize(14);
        doc.setTextColor(30, 41, 59);

        if (reportAuthor) {
            doc.setFont('helvetica', 'normal');
            doc.text(`Autor: ${reportAuthor}`, margin + 20, currentY);
            currentY += 10;
        }

        if (reportDate) {
            const formattedDate = formatDate(reportDate);
            doc.text(`Fecha: ${formattedDate}`, margin + 20, currentY);
            currentY += 10;
        }

        const totalPhotos = state.photos.length;
        doc.text(`Total de fotografías: ${totalPhotos}`, margin + 20, currentY);

        currentY = pageHeight - 40;
        doc.setFontSize(10);
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.text('Generado por: Redes Carreras App', pageWidth / 2, currentY, { align: 'center' });

        // ================================
        // CONTENT PAGES - ALL PHOTOS
        // ================================
        addPage();

        statusText.textContent = 'Generando contenido...';
        progressFill.style.width = '15%';

        const groupNames = Object.keys(state.groups);
        let processedGroups = 0;
        let totalPhotosInPDF = 0;

        // Calculate photo dimensions
        const photoWidth = (contentWidth - 8) / 2;
        const photoHeight = photoWidth * 0.75;
        const photoGap = 8;

        for (const groupName of groupNames) {
            const photos = state.groups[groupName];

            // Check if we need a new page before the group header
            checkPageBreak(30);

            doc.setFillColor(0, 86, 179);
            doc.rect(margin, currentY, contentWidth, 12, 'F');

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(groupName, margin + 5, currentY + 8);
            currentY += 18;

            let col = 0;
            let photoY = currentY;

            // Process ALL photos in the group - NO LIMIT
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];

                // Calculate position
                const photoX = margin + (col * (photoWidth + photoGap));

                // Check for page break BEFORE drawing
                const requiredHeight = photoHeight + 10;
                if (currentY + requiredHeight > pageHeight - margin - 20) {
                    doc.addPage();
                    currentY = margin;
                    photoY = currentY;
                    col = 0;
                }

                // Use base64Data directly (already available)
                let imageData = photo.base64Data;

                if (imageData) {
                    try {
                        // Add image to PDF
                        doc.addImage(imageData, 'JPEG', photoX, photoY, photoWidth, photoHeight);

                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(100, 116, 139);

                        let displayName = photo.originalName;
                        if (displayName.length > 25) {
                            displayName = displayName.substring(0, 22) + '...';
                        }

                        doc.text(displayName, photoX + photoWidth / 2, photoY + photoHeight + 5, { align: 'center' });

                        totalPhotosInPDF++;
                    } catch (imgError) {
                        console.error('Error adding image:', photo.originalName, imgError);
                    }
                }

                // Move to next column/row
                col++;
                if (col >= 2) {
                    col = 0;
                    photoY += photoHeight + 12;
                    // CRITICAL: Update currentY to track position on page
                    currentY = photoY;
                } else {
                    // For left column, update currentY to track the right column's position
                    currentY = photoY;
                }
            }

            // Move to next row if we ended on odd column (left column only)
            if (col === 1) {
                photoY += photoHeight + 12;
                currentY = photoY;
            }

            // Update currentY to end of group
            currentY = photoY + 15;

            processedGroups++;
            const groupProgress = (processedGroups / groupNames.length) * 80;
            progressFill.style.width = (15 + groupProgress) + '%';
            statusText.textContent = `Procesando... ${totalPhotosInPDF} fotos`;
        }

        // ================================
        // ADD FOOTERS TO ALL PAGES
        // ================================
        statusText.textContent = 'Finalizando...';
        progressFill.style.width = '95%';

        const totalPages = doc.internal.getNumberOfPages();

        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            addFooterAndWatermark(i, totalPages, i > 1);
        }

        // ================================
        // SAVE PDF
        // ================================
        statusText.textContent = 'Guardando PDF...';
        progressFill.style.width = '100%';

        const timestamp = new Date().toISOString().slice(0, 10);
        let filename = `Reporte_Fotos_${reportCode || timestamp}`;
        if (reportCode) {
            filename = `Reporte_Fotos_${reportCode}`;
        } else {
            filename = `Reporte_Fotos_${timestamp}`;
        }

        doc.save(`${filename}.pdf`);

        statusText.textContent = `¡Reporte generado! ${totalPhotosInPDF} fotografías`;

        setTimeout(() => {
            modal.classList.add('hidden');
        }, 1500);

    } catch (error) {
        console.error('Error generating PDF:', error);
        const errorMsg = error.message || 'Error desconocido';
        alert('Error al generar el PDF: ' + errorMsg + '. Por favor, intenta de nuevo.');
        modal.classList.add('hidden');
    }
}

/**
 * Load image as base64 with robust error handling
 */
function loadImageAsBase64(src, defaultType = 'image/jpeg') {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const timeout = setTimeout(() => {
            resolve(null);
        }, 10000);

        img.onload = () => {
            clearTimeout(timeout);
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const type = src.includes('.png') ? 'image/png' : defaultType;
                resolve(canvas.toDataURL(type, 0.9));
            } catch (e) {
                resolve(null);
            }
        };

        img.onerror = () => {
            clearTimeout(timeout);
            resolve(null);
        };

        img.src = src;
    });
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('es-ES', options);
}

/**
 * Generate unique ID
 */
function generateUniqueId() {
    return 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ================================
// App Actions
// ================================

/**
 * Add more photos to the report
 */
let lastAddMoreTime = 0;
function addMorePhotos() {
    const currentTime = Date.now();
    if (currentTime - lastAddMoreTime < 500) return;
    lastAddMoreTime = currentTime;

    const input = window.additionalInput || document.getElementById('additional-files');
    if (!input) return;

    input.value = '';
    input.click();
}

/**
 * Reset the application
 */
function resetApp() {
    if (state.photos.length > 0) {
        const confirmReset = confirm('¿Estás seguro de que quieres crear un nuevo reporte? Se perderán todas las fotografías cargadas.');
        if (!confirmReset) return;
    }

    for (const photo of state.photos) {
        URL.revokeObjectURL(photo.objectUrl);
    }

    state.photos = [];
    state.groups = {};
    state.processedFiles.clear();

    document.getElementById('report-title').value = 'REPORTE DE FOTOS';
    document.getElementById('report-code').value = '';
    document.getElementById('report-author').value = '';
    document.getElementById('report-date').value = new Date().toISOString().split('T')[0];

    document.getElementById('file-input').value = '';
    document.getElementById('additional-files').value = '';

    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('pdf-progress').style.width = '0%';

    document.getElementById('upload-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}
