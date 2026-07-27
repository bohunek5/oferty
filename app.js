// Prescot Offer PDF Organizer

if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const COLUMN_BOUNDARIES = [0.035, 0.40, 0.54, 0.595, 0.64, 0.73, 0.78, 0.88];
const DOCUMENT_COLUMNS = [
    { key: 'position', label: 'Lp.', weight: 5, align: 'center' },
    { key: 'name', label: 'Nazwa', weight: 33, align: 'text' },
    { key: 'catalogIndex', label: 'Indeks', weight: 14, align: 'text' },
    { key: 'qty', label: 'Ilość', weight: 6, align: 'number' },
    { key: 'unit', label: 'Jm', weight: 6, align: 'center' },
    { key: 'catalogNetPrice', label: 'Cena netto', weight: 11, align: 'number' },
    { key: 'discountPercent', label: 'Mój rabat', weight: 7, align: 'number' },
    { key: 'netPrice', label: 'Netto po rabacie', weight: 11, align: 'number' },
    { key: 'netTotal', label: 'Wartość netto', weight: 11, align: 'number' }
];
const FLEXIBLE_HEADER_ALIASES = {
    position: ['lp', 'poz', 'pozycja', 'nr', 'numer'],
    name: ['nazwa', 'opis', 'produkt', 'towar', 'usluga', 'asortyment', 'nazwatowaru', 'nazwaproduktu'],
    catalogIndex: ['indeks', 'kod', 'sku', 'symbol', 'nrkatalogowy', 'indekskatalogowy', 'kodproduktu'],
    qty: ['ilosc', 'qty', 'liczba'],
    unit: ['jm', 'jedn', 'jednostka', 'jednostkamiary'],
    catalogNetPrice: ['cenakatalogowa', 'cenacennikowa'],
    discountPercent: ['rabat', 'rabatprocent', 'upust', 'upustprocent'],
    netPrice: ['cena', 'netto', 'cenanetto', 'cenajednostkowa', 'cenajednostkowanetto', 'nettoporabacie', 'cenaporabacie'],
    netTotal: ['wartosc', 'wartoscnetto', 'razem', 'razemnetto', 'suma', 'sumanetto', 'wartoscbrutto']
};
const EMBEDDED_DATA_PREFIX = 'OFD1';
let nextItemId = 1;

const state = {
    items: [],
    sourceFileName: '',
    sourcePageCount: 0,
    marginPercent: 0,
    vatPercent: 23,
    documentDataMode: 'filled',
    documentColumns: Object.fromEntries(DOCUMENT_COLUMNS.map((column) => [column.key, true])),
    meta: {
        offerNumber: 'OF/2026/07/001',
        issueDate: localDateValue(new Date()),
        validityDate: localDateValue(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
        paymentTerms: 'Przelew 14 dni',
        recipientName: '',
        recipientNip: '',
        recipientAddress: ''
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    setupEventListeners();
    updateCalculations();
    setupPreviewSizing();
    window.__offerAgent = {
        state,
        parsePageItems,
        parseNumber,
        getSnapshot: () => JSON.parse(JSON.stringify(state))
    };
});

function initializeForm() {
    document.getElementById('issueDate').value = state.meta.issueDate;
    document.getElementById('validityDate').value = state.meta.validityDate;
    syncDocumentColumnControls();
    syncDocumentDataMode();
    syncDocumentMeta();
}

function setupEventListeners() {
    const dropZone = document.getElementById('dropZone');
    const pdfInput = document.getElementById('pdfInput');

    dropZone.addEventListener('click', () => pdfInput.click());
    dropZone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            pdfInput.click();
        }
    });
    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('is-dragging');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'));
    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('is-dragging');
        const [file] = event.dataTransfer.files;
        if (file) handlePdfFile(file);
    });
    pdfInput.addEventListener('change', (event) => {
        const [file] = event.target.files;
        if (file) handlePdfFile(file);
    });

    bindMetaInput('recipientNip', 'recipientNip');
    bindMetaInput('recipientName', 'recipientName');
    bindMetaInput('recipientAddress', 'recipientAddress');
    bindMetaInput('offerNumber', 'offerNumber');
    bindMetaInput('issueDate', 'issueDate');
    bindMetaInput('validityDate', 'validityDate');
    bindMetaInput('paymentTerms', 'paymentTerms');
    document.querySelectorAll('input[name="documentDataMode"]').forEach((input) => {
        input.addEventListener('change', (event) => {
            if (!event.target.checked) return;
            state.documentDataMode = event.target.value;
            syncDocumentDataMode();
        });
    });

    document.getElementById('vatPercent').addEventListener('input', (event) => {
        state.vatPercent = safeNumber(event.target.value, 0);
        updateCalculations();
    });

    document.getElementById('btnApplyMargin').addEventListener('click', () => {
        state.marginPercent = safeNumber(document.getElementById('marginPercent').value, 0);
        applyMarginToAllItems();
    });
    document.getElementById('btnResetPrices').addEventListener('click', restoreImportedPrices);
    document.getElementById('btnAddRow').addEventListener('click', addNewItem);
    document.getElementById('btnClearTable').addEventListener('click', () => {
        if (state.items.length && !window.confirm('Usunąć wszystkie pozycje z tabeli?')) return;
        state.items = [];
        state.sourceFileName = '';
        state.sourcePageCount = 0;
        setImportStatus('idle', 'Tabela wyczyszczona', 'Możesz wgrać kolejny PDF.');
        updateCalculations();
    });

    document.getElementById('itemsTableBody').addEventListener('change', handleEditorChange);
    document.getElementById('itemsTableBody').addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="remove"]');
        if (button) removeItem(Number(button.dataset.id));
    });
    document.getElementById('documentColumnOptions').addEventListener('change', handleDocumentColumnChange);

    document.getElementById('btnScrollToPreview').addEventListener('click', () => {
        document.getElementById('previewSection').scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('btnGeneratePDF').addEventListener('click', generatePDF);
}

function bindMetaInput(elementId, key) {
    document.getElementById(elementId).addEventListener('input', (event) => {
        state.meta[key] = event.target.value;
        syncDocumentMeta();
    });
}

function syncDocumentMeta() {
    document.getElementById('docOfferNumber').textContent = state.meta.offerNumber || 'OFERTA';
    document.getElementById('docRecipientName').textContent = state.meta.recipientName || 'Brak danych odbiorcy';
    document.getElementById('docRecipientNip').textContent = state.meta.recipientNip
        ? `NIP: ${state.meta.recipientNip}`
        : 'NIP: -';
    document.getElementById('docRecipientAddress').textContent = state.meta.recipientAddress;
    document.getElementById('docIssueDate').textContent = formatDate(state.meta.issueDate);
    document.getElementById('docValidityDate').textContent = formatDate(state.meta.validityDate);
    document.getElementById('docPaymentTerms').textContent = state.meta.paymentTerms || '-';
}

function syncDocumentDataMode() {
    const isBlank = state.documentDataMode === 'blank';
    document.getElementById('offerDataFields').hidden = isBlank;
    document.getElementById('pdfPaper').classList.toggle('is-blank-form', isBlank);
}

function setupPreviewSizing() {
    const stage = document.querySelector('.paper-stage');
    const paper = document.getElementById('pdfPaper');
    if (window.ResizeObserver) {
        const observer = new ResizeObserver(() => updatePreviewScale());
        observer.observe(stage);
        observer.observe(paper);
    }
    window.addEventListener('resize', updatePreviewScale);
    updatePreviewScale();
}

function updatePreviewScale() {
    const stage = document.querySelector('.paper-stage');
    const paper = document.getElementById('pdfPaper');
    if (!stage || !paper || paper.hidden || window.innerWidth <= 1100) {
        paper?.classList.remove('is-preview-scaled');
        paper?.style.removeProperty('--preview-scale');
        if (stage) stage.style.height = '';
        return;
    }

    const horizontalPadding = 36;
    const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
    const scale = Math.min(1, availableWidth / paper.offsetWidth);
    paper.style.setProperty('--preview-scale', String(scale));
    paper.classList.add('is-preview-scaled');
    stage.style.height = `${Math.ceil(paper.offsetHeight * scale + horizontalPadding)}px`;
}

async function handlePdfFile(file) {
    const isPdf = file && (
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf')
    );
    if (!isPdf) {
        setImportStatus('error', 'Nieprawidłowy plik', 'Wybierz dokument w formacie PDF.');
        window.alert('Wybierz prawidłowy plik PDF.');
        return;
    }
    if (!window.pdfjsLib) {
        setImportStatus('error', 'Brak biblioteki PDF', 'Odśwież stronę i spróbuj ponownie.');
        return;
    }

    const fileNameDisplay = document.getElementById('fileNameDisplay');
    fileNameDisplay.textContent = file.name;
    fileNameDisplay.hidden = false;
    setParsingStatus(true, 'Czytam strony i położenie kolumn…');
    setImportStatus('working', 'Analizuję PDF', file.name);

    try {
        const data = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data }).promise;
        const extractedItems = [];
        const embeddedDataParts = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            setParsingStatus(true, `Czytam stronę ${pageNumber} z ${pdf.numPages}…`);
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            const textContent = await page.getTextContent();
            const allPageItems = textContent.items
                .filter((item) => item.str && item.str.trim())
                .map((item) => ({
                    str: item.str.trim(),
                    x: item.transform[4],
                    y: item.transform[5],
                    width: Number(item.width) || 0,
                    height: Number(item.height) || 0
                }));
            const pageEmbeddedParts = collectEmbeddedDataParts(allPageItems);
            embeddedDataParts.push(...pageEmbeddedParts);
            const pageItems = allPageItems.filter((item) => !isEmbeddedDataText(item.str));

            let parsedRows = parsePageItems(pageItems, viewport.width, pageNumber);
            if (!parsedRows.length && !pageEmbeddedParts.length) {
                setParsingStatus(true, `Uruchamiam OCR strony ${pageNumber} z ${pdf.numPages}…`);
                const ocrItems = await recognizePageWithOcr(page, pageNumber, pdf.numPages);
                parsedRows = parseOcrPageItems(ocrItems, viewport.width, pageNumber);
            }
            extractedItems.push(...parsedRows);
        }

        const embeddedPayload = decodeEmbeddedOfferData(embeddedDataParts);
        const items = embeddedPayload
            ? hydrateEmbeddedItems(embeddedPayload.items, pdf.numPages)
            : deduplicateAndSort(extractedItems);
        if (!items.length) {
            throw new Error('Nie znaleziono wierszy tabeli — także po próbie OCR. Sprawdź jakość i układ dokumentu.');
        }

        state.items = items;
        state.sourceFileName = file.name;
        state.sourcePageCount = pdf.numPages;
        state.marginPercent = 0;
        document.getElementById('marginPercent').value = '0';
        if (embeddedPayload) restoreEmbeddedDocumentState(embeddedPayload);

        const sequenceInfo = describeSequence(items);
        setImportStatus(
            sequenceInfo.complete ? 'success' : 'working',
            `Wczytano ${items.length} pozycji`,
            sequenceInfo.message
        );
        setParsingStatus(false);
        updateCalculations();
    } catch (error) {
        console.error('Błąd importu PDF:', error);
        setParsingStatus(true, error.message || 'Nie udało się odczytać pozycji.', true);
        setImportStatus('error', 'Import nieudany', error.message || 'Sprawdź plik i spróbuj ponownie.');
    }
}

async function recognizePageWithOcr(page, pageNumber, pageCount) {
    if (!window.Tesseract) {
        throw new Error('Nie udało się uruchomić OCR. Sprawdź połączenie z internetem i odśwież stronę.');
    }

    const scale = 4;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: context, viewport }).promise;
    const detectedGrid = removeLongTableLines(canvas, context, scale);

    let lastProgress = -1;
    const result = await window.Tesseract.recognize(
        canvas,
        'pol+eng',
        {
            logger: (message) => {
                if (message.status !== 'recognizing text') return;
                const progress = Math.round((message.progress || 0) * 100);
                if (progress === lastProgress) return;
                lastProgress = progress;
                setParsingStatus(
                    true,
                    `OCR strony ${pageNumber} z ${pageCount}: ${progress}%`
                );
            }
        },
        {
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1'
        }
    );
    const words = result?.data?.words || [];
    const items = words
        .filter((word) => word.text && word.text.trim() && word.bbox)
        .map((word) => ({
            str: word.text.trim(),
            x: word.bbox.x0 / scale,
            y: (canvas.height - word.bbox.y1) / scale,
            width: (word.bbox.x1 - word.bbox.x0) / scale,
            height: (word.bbox.y1 - word.bbox.y0) / scale
        }));
    items.gridColumns = detectedGrid.verticalLines.map((position) => position / scale);
    releaseCanvas(canvas);
    return items;
}

function isEmbeddedDataText(value) {
    return String(value || '').startsWith(`${EMBEDDED_DATA_PREFIX}|`);
}

function collectEmbeddedDataParts(pageItems) {
    const parts = [];
    pageItems.forEach((item) => {
        const value = String(item.str || '');
        const match = value.match(/^OFD1\|(\d+)\|(\d+)\|([A-Za-z0-9+/=]+)$/);
        if (!match) return;
        parts.push({
            index: Number(match[1]),
            total: Number(match[2]),
            value: match[3]
        });
    });
    return parts;
}

function decodeEmbeddedOfferData(parts) {
    if (!parts.length) return null;
    const expectedTotal = parts[0].total;
    if (
        !Number.isInteger(expectedTotal) ||
        expectedTotal < 1 ||
        parts.some((part) => part.total !== expectedTotal)
    ) {
        return null;
    }

    const byIndex = new Map();
    parts.forEach((part) => {
        if (
            Number.isInteger(part.index) &&
            part.index >= 1 &&
            part.index <= expectedTotal
        ) {
            byIndex.set(part.index, part.value);
        }
    });
    if (byIndex.size !== expectedTotal) return null;

    try {
        const encoded = Array.from(
            { length: expectedTotal },
            (_, index) => byIndex.get(index + 1)
        ).join('');
        const binary = window.atob(encoded);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        return payload?.version === 1 && Array.isArray(payload.items) ? payload : null;
    } catch (error) {
        console.warn('Nie udało się odczytać danych edycyjnych z PDF:', error);
        return null;
    }
}

function hydrateEmbeddedItems(rawItems, pageCount) {
    return rawItems.map((rawItem, index) => {
        const position = Number.parseInt(rawItem.position, 10);
        const qty = safeNumber(rawItem.qty, 1);
        const catalogNetPrice = safeNumber(rawItem.catalogNetPrice, 0);
        const discountPercent = safeNumber(rawItem.discountPercent, 0);
        const netPrice = safeNumber(rawItem.netPrice, catalogNetPrice);
        const netTotal = safeNumber(rawItem.netTotal, roundMoney(qty * netPrice));
        return {
            id: nextItemId++,
            position: Number.isFinite(position) ? position : index + 1,
            name: String(rawItem.name || '').trim(),
            catalogIndex: String(rawItem.catalogIndex || '').trim(),
            qty,
            unit: String(rawItem.unit || 'szt.').trim() || 'szt.',
            catalogNetPrice,
            discountPercent,
            netPrice,
            netTotal,
            preserveTotal: true,
            sourcePage: Math.min(
                Math.max(1, Number.parseInt(rawItem.sourcePage, 10) || 1),
                Math.max(1, pageCount)
            ),
            original: {
                catalogNetPrice,
                discountPercent,
                netPrice,
                netTotal
            }
        };
    }).filter((item) => item.name);
}

function restoreEmbeddedDocumentState(payload) {
    if (payload.meta && typeof payload.meta === 'object') {
        Object.keys(state.meta).forEach((key) => {
            if (typeof payload.meta[key] === 'string') state.meta[key] = payload.meta[key];
        });
    }
    state.vatPercent = safeNumber(payload.vatPercent, state.vatPercent);
    if (payload.documentDataMode === 'filled' || payload.documentDataMode === 'blank') {
        state.documentDataMode = payload.documentDataMode;
    }
    if (payload.documentColumns && typeof payload.documentColumns === 'object') {
        DOCUMENT_COLUMNS.forEach((column) => {
            state.documentColumns[column.key] = payload.documentColumns[column.key] !== false;
        });
        if (!getVisibleDocumentColumns().length) state.documentColumns.position = true;
    }

    document.getElementById('offerNumber').value = state.meta.offerNumber;
    document.getElementById('issueDate').value = state.meta.issueDate;
    document.getElementById('validityDate').value = state.meta.validityDate;
    document.getElementById('paymentTerms').value = state.meta.paymentTerms;
    document.getElementById('recipientName').value = state.meta.recipientName;
    document.getElementById('recipientNip').value = state.meta.recipientNip;
    document.getElementById('recipientAddress').value = state.meta.recipientAddress;
    document.getElementById('vatPercent').value = formatInputNumber(state.vatPercent);
    syncDocumentColumnControls();
    syncDocumentDataMode();
    syncDocumentMeta();
}

function removeLongTableLines(canvas, context, scale) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    const horizontal = new Uint8Array(canvas.height);
    const vertical = new Uint8Array(canvas.width);
    const isDark = (x, y) => {
        const index = (y * canvas.width + x) * 4;
        return pixels[index] < 140 &&
            pixels[index + 1] < 140 &&
            pixels[index + 2] < 140;
    };

    for (let y = 0; y < canvas.height; y += 1) {
        let darkPixels = 0;
        for (let x = 0; x < canvas.width; x += 1) {
            if (isDark(x, y)) darkPixels += 1;
        }
        if (darkPixels > canvas.width * 0.55) horizontal[y] = 1;
    }
    for (let x = 0; x < canvas.width; x += 1) {
        let darkPixels = 0;
        for (let y = 0; y < canvas.height; y += 1) {
            if (isDark(x, y)) darkPixels += 1;
        }
        if (darkPixels > canvas.height * 0.35) vertical[x] = 1;
    }

    const verticalLines = collapseLineMask(vertical);
    const padding = Math.max(2, Math.round(scale));
    expandLineMask(horizontal, padding);
    expandLineMask(vertical, padding);
    for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
            if (!horizontal[y] && !vertical[x]) continue;
            const index = (y * canvas.width + x) * 4;
            pixels[index] = 255;
            pixels[index + 1] = 255;
            pixels[index + 2] = 255;
            pixels[index + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    return { verticalLines };
}

function collapseLineMask(mask) {
    const positions = [];
    let start = -1;
    for (let index = 0; index <= mask.length; index += 1) {
        if (mask[index] && start < 0) {
            start = index;
        } else if (!mask[index] && start >= 0) {
            positions.push((start + index - 1) / 2);
            start = -1;
        }
    }
    return positions;
}

function expandLineMask(mask, padding) {
    const marked = [];
    mask.forEach((value, index) => {
        if (value) marked.push(index);
    });
    marked.forEach((index) => {
        const start = Math.max(0, index - padding);
        const end = Math.min(mask.length - 1, index + padding);
        for (let position = start; position <= end; position += 1) {
            mask[position] = 1;
        }
    });
}

function parseOcrPageItems(pageItems, pageWidth, pageNumber) {
    const flexibleRows = parseFlexiblePageItems(pageItems, pageWidth, pageNumber);
    if (flexibleRows.length) return flexibleRows;
    const numberedRows = parseNumberedTablePageItems(pageItems, pageWidth, pageNumber);
    if (numberedRows.length) return numberedRows;
    return parseSapPageItems(pageItems, pageWidth, pageNumber);
}

function parsePageItems(pageItems, pageWidth, pageNumber) {
    const exactRows = parseSapPageItems(pageItems, pageWidth, pageNumber);
    if (exactRows.length) return exactRows;
    const flexibleRows = parseFlexiblePageItems(pageItems, pageWidth, pageNumber);
    if (flexibleRows.length) return flexibleRows;
    return parseNumberedTablePageItems(pageItems, pageWidth, pageNumber);
}

function parseSapPageItems(pageItems, pageWidth, pageNumber) {
    const normalizedItems = pageItems.map((item) => ({
        ...item,
        normalized: normalizeLabel(item.str)
    }));
    const lpHeaders = normalizedItems.filter((item) => item.normalized === 'lp');
    const header = lpHeaders.find((candidate) =>
        normalizedItems.some((item) =>
            item.normalized === 'nazwa' &&
            Math.abs(item.y - candidate.y) < 10 &&
            item.x > candidate.x
        )
    );
    if (!header) return [];

    const headerY = header.y;
    const tableLeft = Math.max(0, header.x - 4);
    const tableRight = pageWidth - tableLeft;
    const tableWidth = tableRight - tableLeft;
    const firstColumnEnd = tableLeft + tableWidth * COLUMN_BOUNDARIES[0];

    const rowStarts = normalizedItems
        .filter((item) =>
            /^\d{1,4}$/.test(item.str) &&
            item.x >= tableLeft - 2 &&
            item.x < firstColumnEnd &&
            item.y < headerY - 4 &&
            item.y > 28
        )
        .sort((a, b) => b.y - a.y);

    const uniqueStarts = rowStarts.filter((item, index, list) =>
        index === 0 ||
        item.str !== list[index - 1].str ||
        Math.abs(item.y - list[index - 1].y) > 2
    );
    if (!uniqueStarts.length) return [];

    const stopYs = normalizedItems
        .filter((item) =>
            /^(netto|brutto|wartoscslownie)$/.test(item.normalized) ||
            item.normalized.startsWith('wydrukowano') ||
            item.normalized.startsWith('strona')
        )
        .map((item) => item.y);
    const rows = [];

    uniqueStarts.forEach((start, index) => {
        const nextStart = uniqueStarts[index + 1];
        const closestSummary = Math.max(
            28,
            ...stopYs.filter((y) => y < start.y)
        );
        const bottomY = nextStart ? nextStart.y + 2 : closestSummary + 2;
        const topY = start.y + Math.max(3, start.height * 0.4);
        const rowItems = pageItems.filter((item) =>
            item.y <= topY &&
            item.y > bottomY &&
            item.x >= tableLeft - 2 &&
            item.x <= tableRight + 2
        );

        const parsed = parseRowItems(rowItems, tableLeft, tableWidth, pageNumber);
        if (parsed) rows.push(parsed);
    });

    return rows;
}

function parseFlexiblePageItems(pageItems, pageWidth, pageNumber) {
    const normalizedItems = pageItems.map((item) => ({
        ...item,
        normalized: normalizeLabel(item.str),
        headerKey: identifyFlexibleHeader(item.str)
    }));
    const headerGroups = [];

    normalizedItems
        .filter((item) => item.headerKey)
        .sort((a, b) => b.y - a.y)
        .forEach((item) => {
            let group = headerGroups.find((candidate) => Math.abs(candidate.y - item.y) <= 8);
            if (!group) {
                group = { y: item.y, items: [] };
                headerGroups.push(group);
            }
            group.items.push(item);
        });

    const headerGroup = headerGroups
        .map((group) => ({
            ...group,
            keys: new Set(group.items.map((item) => item.headerKey))
        }))
        .filter((group) =>
            group.keys.has('name') &&
            (group.keys.has('qty') || group.keys.has('netPrice') || group.keys.has('netTotal'))
        )
        .sort((a, b) => b.keys.size - a.keys.size)[0];
    if (!headerGroup) return [];

    const layoutColumns = [];
    [...headerGroup.items]
        .sort((a, b) => a.x - b.x)
        .forEach((item) => {
            const previous = layoutColumns[layoutColumns.length - 1];
            const continuesPreviousCell = previous &&
                item.x <= previous.right + 9 &&
                Math.abs(item.y - previous.y) <= 4;
            if (!layoutColumns.some((column) => Math.abs(column.x - item.x) < 12) && !continuesPreviousCell) {
                layoutColumns.push({
                    key: item.headerKey,
                    x: item.x,
                    y: item.y,
                    right: item.x + (item.width || 0)
                });
            } else if (continuesPreviousCell) {
                previous.right = Math.max(previous.right, item.x + (item.width || 0));
            }
        });
    if (layoutColumns.length < 3) return [];

    const tableLeft = Math.max(0, layoutColumns[0].x - 5);
    const tableRight = pageWidth - tableLeft;
    const boundaries = layoutColumns.slice(0, -1).map((column, index) =>
        (column.x + layoutColumns[index + 1].x) / 2
    );
    const headerY = headerGroup.y;
    const stopYs = normalizedItems
        .filter((item) =>
            /^(razem|suma|podsumowanie|total|wartoscslownie|doplaty)$/.test(item.normalized) ||
            item.normalized.startsWith('wydrukowano') ||
            item.normalized.startsWith('strona')
        )
        .map((item) => item.y);
    const tableBottom = Math.max(24, ...stopYs.filter((y) => y < headerY));
    const headerBottomY = Math.min(
        headerY,
        ...normalizedItems
            .filter((item) =>
                item.x >= tableLeft - 3 &&
                item.x <= tableRight + 3 &&
                item.y <= headerY &&
                item.y >= headerY - 22
            )
            .map((item) => item.y)
    );
    const positionColumnIndex = layoutColumns.findIndex((column) => column.key === 'position');
    let rowStarts = [];

    if (positionColumnIndex >= 0) {
        const leftBoundary = positionColumnIndex === 0 ? tableLeft : boundaries[positionColumnIndex - 1];
        const rightBoundary = boundaries[positionColumnIndex] || tableRight;
        rowStarts = normalizedItems
            .filter((item) =>
                /^\d{1,4}[.)]?$/.test(item.str) &&
                item.x >= leftBoundary - 3 &&
                item.x < rightBoundary &&
                item.y < headerY - 4 &&
                item.y > tableBottom + 2
            )
            .sort((a, b) => b.y - a.y);
    } else {
        const anchorKey = ['qty', 'netTotal', 'netPrice']
            .find((key) => layoutColumns.some((column) => column.key === key));
        const anchorIndex = layoutColumns.findIndex((column) => column.key === anchorKey);
        const leftBoundary = anchorIndex === 0 ? tableLeft : boundaries[anchorIndex - 1];
        const rightBoundary = boundaries[anchorIndex] || tableRight;
        rowStarts = normalizedItems
            .filter((item) =>
                Number.isFinite(parseNumber(item.str)) &&
                item.x >= leftBoundary - 3 &&
                item.x < rightBoundary &&
                item.y < headerY - 4 &&
                item.y > tableBottom + 2
            )
            .sort((a, b) => b.y - a.y);
    }

    const uniqueStarts = rowStarts.filter((item, index, list) =>
        index === 0 || Math.abs(item.y - list[index - 1].y) > 2
    );
    if (!uniqueStarts.length) return [];

    return uniqueStarts.map((start, index) => {
        const nextStart = uniqueStarts[index + 1];
        const previousStart = uniqueStarts[index - 1];
        const bottomY = nextStart ? (start.y + nextStart.y) / 2 : tableBottom + 2;
        const topY = previousStart
            ? (previousStart.y + start.y) / 2
            : (headerBottomY + start.y) / 2;
        const rowItems = pageItems.filter((item) =>
            item.y <= topY &&
            item.y > bottomY &&
            item.x >= tableLeft - 3 &&
            item.x <= tableRight + 3
        );
        const generatedPosition = positionColumnIndex < 0 ? index + 1 : null;
        return parseFlexibleRowItems(
            rowItems,
            layoutColumns,
            boundaries,
            pageNumber,
            generatedPosition
        );
    }).filter(Boolean);
}

function parseNumberedTablePageItems(pageItems, pageWidth, pageNumber) {
    const numberCandidates = pageItems
        .filter((item) => /^\s*\d{1,4}[.)]?\s*$/.test(item.str))
        .map((item) => ({ ...item, value: parseInt(item.str, 10) }));
    const xGroups = [];

    numberCandidates.forEach((item) => {
        let group = xGroups.find((candidate) => Math.abs(candidate.x - item.x) <= 8);
        if (!group) {
            group = { x: item.x, items: [] };
            xGroups.push(group);
        }
        group.items.push(item);
        group.x = group.items.reduce((sum, entry) => sum + entry.x, 0) / group.items.length;
    });

    let bestRun = [];
    let bestRunScore = -Infinity;
    xGroups.forEach((group) => {
        const sorted = [...group.items]
            .sort((a, b) => b.y - a.y)
            .filter((item, index, list) => index === 0 || Math.abs(item.y - list[index - 1].y) > 2);
        const sequentialPairs = sorted.slice(1).filter((item, index) =>
            item.value === sorted[index].value + 1
        ).length;
        const requiredPairs = Math.max(1, Math.floor((sorted.length - 1) * 0.45));
        if (
            sorted.length >= 2 &&
            group.x < pageWidth * 0.3 &&
            sequentialPairs >= requiredPairs
        ) {
            const offsets = sorted.map((item, index) => item.value - index);
            const offsetCounts = new Map();
            offsets.forEach((offset) => {
                offsetCounts.set(offset, (offsetCounts.get(offset) || 0) + 1);
            });
            const [dominantOffset, coherentRows] = [...offsetCounts.entries()]
                .sort((a, b) => b[1] - a[1])[0];
            const score = coherentRows * 5 + sequentialPairs * 3 + sorted.length;
            if (score > bestRunScore) {
                bestRunScore = score;
                bestRun = sorted.map((item, index) => ({
                    ...item,
                    value: dominantOffset + index
                }));
            }
        }

        let run = [];
        sorted.forEach((item) => {
            const previous = run[run.length - 1];
            if (!previous || (item.value === previous.value + 1 && item.y < previous.y - 3)) {
                run.push(item);
            } else {
                if (bestRunScore < 0 && run.length > bestRun.length) bestRun = run;
                run = [item];
            }
        });
        if (bestRunScore < 0 && run.length > bestRun.length) bestRun = run;
    });
    if (bestRun.length < 2) return [];

    const rowBands = bestRun.map((anchor, index) => {
        const previous = bestRun[index - 1];
        const next = bestRun[index + 1];
        const previousGap = previous ? previous.y - anchor.y : next ? anchor.y - next.y : 14;
        const nextGap = next ? anchor.y - next.y : previousGap;
        return {
            anchor,
            top: previous ? (previous.y + anchor.y) / 2 : anchor.y + previousGap * 0.55,
            bottom: next ? (anchor.y + next.y) / 2 : anchor.y - nextGap * 0.55
        };
    });
    const tableLeft = Math.max(0, bestRun[0].x - 5);
    const tableRight = pageWidth - tableLeft;
    const rowContents = rowBands.map((band) => pageItems.filter((item) =>
        item.y <= band.top &&
        item.y > band.bottom &&
        item.x >= tableLeft - 3 &&
        item.x <= tableRight + 3
    ));
    const gridRows = parseKnownDocumentGridRows(
        rowContents,
        bestRun,
        pageItems.gridColumns,
        pageWidth,
        pageNumber
    );
    if (gridRows.length === rowContents.length) return gridRows;

    const numericXGroups = [];

    rowContents.forEach((items, rowIndex) => {
        items
            .filter((item) =>
                item.x > Math.max(tableLeft + 18, pageWidth * 0.45) &&
                isStandaloneNumericCell(item.str)
            )
            .forEach((item) => {
                let group = numericXGroups.find((candidate) => Math.abs(candidate.x - item.x) <= 12);
                if (!group) {
                    group = { x: item.x, rows: new Set(), items: [] };
                    numericXGroups.push(group);
                }
                group.items.push(item);
                group.rows.add(rowIndex);
                group.x = group.items.reduce((sum, entry) => sum + entry.x, 0) / group.items.length;
            });
    });

    const minimumRows = Math.max(2, Math.ceil(bestRun.length * 0.5));
    const numericColumns = numericXGroups
        .filter((group) => group.rows.size >= minimumRows)
        .sort((a, b) => a.x - b.x);
    if (!numericColumns.length) return [];

    const firstNumericX = numericColumns[0].x;
    const qtyColumn = numericColumns[0];
    const totalColumn = numericColumns[numericColumns.length - 1];
    const discountColumnIndex = numericColumns.findIndex((column) =>
        column.items.filter((item) => /%/.test(item.str)).length >=
        Math.max(2, Math.ceil(column.items.length * 0.45))
    );
    const catalogPriceColumn = discountColumnIndex > 0
        ? numericColumns[discountColumnIndex - 1]
        : null;
    const priceColumn = discountColumnIndex >= 0 && numericColumns[discountColumnIndex + 1]
        ? numericColumns[discountColumnIndex + 1]
        : numericColumns.length > 1
        ? numericColumns[numericColumns.length - 2]
        : totalColumn;

    return rowContents.map((items, index) => {
        const anchor = bestRun[index];
        const nameItems = items.filter((item) =>
            item.x > anchor.x + 8 &&
            item.x < firstNumericX - 6 &&
            !/^\s*\d{1,4}[.)]?\s*$/.test(item.str)
        );
        let name = cleanCellText(joinCellItems(nameItems));
        if (!name) {
            name = cleanCellText(joinCellItems(items.filter((item) =>
                item.x > anchor.x + 8 && !isStandaloneNumericCell(item.str)
            )));
        }
        const valueAtColumn = (column) => {
            const candidate = items
                .filter((item) => isStandaloneNumericCell(item.str))
                .sort((a, b) => Math.abs(a.x - column.x) - Math.abs(b.x - column.x))[0];
            return candidate && Math.abs(candidate.x - column.x) <= 18
                ? parseNumber(candidate.str)
                : NaN;
        };
        const qty = safeNumber(valueAtColumn(qtyColumn), 1);
        const discountItem = items.find((item) => /%/.test(item.str) && isStandaloneNumericCell(item.str));
        const discountPercent = discountItem ? safeNumber(parseNumber(discountItem.str), 0) : 0;
        let catalogNetPrice = catalogPriceColumn
            ? valueAtColumn(catalogPriceColumn)
            : NaN;
        let netTotal = valueAtColumn(totalColumn);
        let netPrice = valueAtColumn(priceColumn);
        if (!Number.isFinite(netPrice) && Number.isFinite(netTotal) && qty) {
            netPrice = roundMoney(netTotal / qty);
        }
        if (!Number.isFinite(netTotal) && Number.isFinite(netPrice)) {
            netTotal = roundMoney(qty * netPrice);
        }
        if (!Number.isFinite(catalogNetPrice)) {
            catalogNetPrice = discountPercent < 100
                ? roundMoney(netPrice / (1 - discountPercent / 100))
                : netPrice;
        }

        if (!name || !Number.isFinite(netPrice) || !Number.isFinite(netTotal)) return null;
        return {
            id: nextItemId++,
            position: anchor.value,
            name,
            catalogIndex: '',
            qty,
            unit: 'szt.',
            catalogNetPrice,
            discountPercent,
            netPrice,
            netTotal,
            preserveTotal: true,
            sourcePage: pageNumber,
            original: {
                catalogNetPrice,
                discountPercent,
                netPrice,
                netTotal
            }
        };
    }).filter(Boolean);
}

function parseKnownDocumentGridRows(rowContents, anchors, gridColumns, pageWidth, pageNumber) {
    if (
        !Array.isArray(gridColumns) ||
        gridColumns.length !== DOCUMENT_COLUMNS.length + 1 ||
        gridColumns[gridColumns.length - 1] - gridColumns[0] < pageWidth * 0.7
    ) {
        return [];
    }

    return rowContents.map((items, rowIndex) => {
        const cellText = gridColumns.slice(0, -1).map((left, columnIndex) => {
            const right = gridColumns[columnIndex + 1];
            return cleanCellText(joinCellItems(items.filter((item) =>
                item.x >= left - 2 &&
                item.x < right - 1
            )));
        });
        const qty = safeNumber(parseNumber(cellText[3]), 1);
        const catalogNetPrice = parseNumber(cellText[5]);
        const discountPercent = safeNumber(parseNumber(cellText[6]), 0);
        let netPrice = parseNumber(cellText[7]);
        let netTotal = parseNumber(cellText[8]);
        if (!Number.isFinite(netPrice) && Number.isFinite(catalogNetPrice)) {
            netPrice = roundMoney(catalogNetPrice * (1 - discountPercent / 100));
        }
        if (!Number.isFinite(netTotal) && Number.isFinite(netPrice)) {
            netTotal = roundMoney(netPrice * qty);
        }
        if (!cellText[1] || !Number.isFinite(netPrice) || !Number.isFinite(netTotal)) {
            return null;
        }
        return {
            id: nextItemId++,
            position: anchors[rowIndex].value,
            name: cellText[1],
            catalogIndex: cellText[2],
            qty,
            unit: cellText[4] || 'szt.',
            catalogNetPrice: Number.isFinite(catalogNetPrice) ? catalogNetPrice : netPrice,
            discountPercent,
            netPrice,
            netTotal,
            preserveTotal: true,
            sourcePage: pageNumber,
            original: {
                catalogNetPrice: Number.isFinite(catalogNetPrice) ? catalogNetPrice : netPrice,
                discountPercent,
                netPrice,
                netTotal
            }
        };
    }).filter(Boolean);
}

function isStandaloneNumericCell(value) {
    return /^-?\s*\d[\d\s.,]*\s*%?$/.test(String(value || '').replace(/\u00a0/g, ' ').trim());
}

function identifyFlexibleHeader(value) {
    const normalized = normalizeLabel(value);
    return Object.entries(FLEXIBLE_HEADER_ALIASES)
        .find(([, aliases]) => aliases.some((alias) =>
            normalized === alias ||
            (alias.length >= 4 && normalized.startsWith(alias))
        ))?.[0] || '';
}

function parseFlexibleRowItems(rowItems, columns, boundaries, pageNumber, generatedPosition = null) {
    const cellItems = columns.map(() => []);
    rowItems.forEach((item) => {
        let columnIndex = boundaries.findIndex((boundary) => item.x < boundary);
        if (columnIndex === -1) columnIndex = columns.length - 1;
        if (columns[columnIndex]) cellItems[columnIndex].push(item);
    });
    const valuesByKey = {};
    columns.forEach((column, index) => {
        const value = joinCellItems(cellItems[index]);
        if (!valuesByKey[column.key]) valuesByKey[column.key] = [];
        valuesByKey[column.key].push(value);
    });
    const firstText = (key) =>
        (valuesByKey[key] || []).map(cleanCellText).find(Boolean) || '';
    const firstNumber = (key) => {
        for (const value of valuesByKey[key] || []) {
            const number = parseNumber(value);
            if (Number.isFinite(number)) return number;
        }
        return NaN;
    };

    const position = generatedPosition ?? parseInt(firstText('position'), 10);
    const name = firstText('name');
    const qty = safeNumber(firstNumber('qty'), 1);
    const discountPercent = safeNumber(firstNumber('discountPercent'), 0);
    let catalogNetPrice = firstNumber('catalogNetPrice');
    const detectedNetPrices = (valuesByKey.netPrice || [])
        .map(parseNumber)
        .filter(Number.isFinite);
    let netPrice = detectedNetPrices.at(-1);
    if (!Number.isFinite(catalogNetPrice) && detectedNetPrices.length > 1) {
        catalogNetPrice = detectedNetPrices[0];
    }
    let netTotal = firstNumber('netTotal');

    if (!Number.isFinite(netPrice) && Number.isFinite(catalogNetPrice)) {
        netPrice = roundMoney(catalogNetPrice * (1 - discountPercent / 100));
    }
    if (!Number.isFinite(netPrice) && Number.isFinite(netTotal) && qty) {
        netPrice = roundMoney(netTotal / qty);
    }
    if (!Number.isFinite(catalogNetPrice) && Number.isFinite(netPrice)) {
        catalogNetPrice = discountPercent < 100
            ? roundMoney(netPrice / (1 - discountPercent / 100))
            : netPrice;
    }
    if (!Number.isFinite(netTotal) && Number.isFinite(netPrice)) {
        netTotal = roundMoney(qty * netPrice);
    }

    if (
        !Number.isFinite(position) ||
        !name ||
        !Number.isFinite(netPrice) ||
        !Number.isFinite(netTotal)
    ) {
        return null;
    }

    return {
        id: nextItemId++,
        position,
        name,
        catalogIndex: firstText('catalogIndex'),
        qty,
        unit: firstText('unit') || 'szt.',
        catalogNetPrice,
        discountPercent,
        netPrice,
        netTotal,
        preserveTotal: true,
        sourcePage: pageNumber,
        original: {
            catalogNetPrice,
            discountPercent,
            netPrice,
            netTotal
        }
    };
}

function parseRowItems(rowItems, tableLeft, tableWidth, pageNumber) {
    const cells = Array.from({ length: 9 }, () => []);
    const absoluteBoundaries = COLUMN_BOUNDARIES.map((ratio) => tableLeft + tableWidth * ratio);

    rowItems.forEach((item) => {
        let column = absoluteBoundaries.findIndex((boundary) => item.x < boundary);
        if (column === -1) column = 8;
        cells[column].push(item);
    });

    const values = cells.map(joinCellItems);
    const position = parseInt(values[0], 10);
    const name = values[1].trim();
    const qty = parseNumber(values[3]);
    const catalogNetPrice = parseNumber(values[5]);
    const discountPercent = parseNumber(values[6]);
    const netPrice = parseNumber(values[7]);
    const netTotal = parseNumber(values[8]);

    if (
        !Number.isFinite(position) ||
        !name ||
        !Number.isFinite(qty) ||
        !Number.isFinite(netPrice) ||
        !Number.isFinite(netTotal)
    ) {
        return null;
    }

    return {
        id: nextItemId++,
        position,
        name: cleanCellText(name),
        catalogIndex: cleanCellText(values[2]),
        qty,
        unit: cleanCellText(values[4]),
        catalogNetPrice: Number.isFinite(catalogNetPrice) ? catalogNetPrice : netPrice,
        discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
        netPrice,
        netTotal,
        preserveTotal: true,
        sourcePage: pageNumber,
        original: {
            catalogNetPrice: Number.isFinite(catalogNetPrice) ? catalogNetPrice : netPrice,
            discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
            netPrice,
            netTotal
        }
    };
}

function joinCellItems(items) {
    if (!items.length) return '';
    const sorted = [...items].sort((a, b) => {
        if (Math.abs(a.y - b.y) > 2.4) return b.y - a.y;
        return a.x - b.x;
    });
    const lines = [];

    sorted.forEach((item) => {
        let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.4);
        if (!line) {
            line = { y: item.y, items: [] };
            lines.push(line);
        }
        line.items.push(item);
    });

    return lines
        .sort((a, b) => b.y - a.y)
        .map((line) => {
            const tokens = line.items.sort((a, b) => a.x - b.x);
            return tokens.reduce((text, item, index) => {
                if (index === 0) return item.str;
                const previous = tokens[index - 1];
                const gap = item.x - (previous.x + previous.width);
                return `${text}${gap > 1.1 ? ' ' : ''}${item.str}`;
            }, '');
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanCellText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:)])/g, '$1')
        .replace(/([(])\s+/g, '$1')
        .trim();
}

function normalizeLabel(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
}

function parseNumber(value) {
    if (value === null || value === undefined) return NaN;
    const cleaned = String(value)
        .replace(/\u00a0/g, ' ')
        .replace(/[^\d,.\-\s]/g, '')
        .replace(/\s/g, '');
    if (!cleaned) return NaN;

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
        return Number(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    if (lastDot > lastComma) {
        return Number(cleaned.replace(/,/g, ''));
    }
    return Number(cleaned);
}

function deduplicateAndSort(items) {
    const seen = new Set();
    return items
        .filter((item) => {
            const key = `${item.position}|${item.name}|${item.sourcePage}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.position - b.position);
}

function describeSequence(items) {
    const positions = items.map((item) => item.position);
    const unique = new Set(positions);
    const min = Math.min(...positions);
    const max = Math.max(...positions);
    const expected = max - min + 1;
    const complete = unique.size === items.length && items.length === expected;
    return {
        complete,
        message: complete
            ? `Pozycje ${min}-${max}, kolejność kompletna, ${state.sourcePageCount} str.`
            : `Wczytano zakres ${min}-${max}. Sprawdź brakujące lub powtórzone numery.`
    };
}

function setParsingStatus(visible, message = '', isError = false) {
    const box = document.getElementById('parsingStatus');
    const text = document.getElementById('parsingStatusText');
    box.hidden = !visible;
    text.textContent = message;
    box.style.borderColor = isError ? '#a84b43' : '';
    box.style.background = isError ? '#fff4f2' : '';
    const spinner = box.querySelector('.spinner');
    if (spinner) spinner.hidden = isError;
}

function setImportStatus(tone, title, detail) {
    const dot = document.getElementById('importStateDot');
    dot.className = 'status-dot';
    if (tone === 'working') dot.classList.add('is-working');
    if (tone === 'success') dot.classList.add('is-success');
    if (tone === 'error') dot.classList.add('is-error');
    document.getElementById('importStateTitle').textContent = title;
    document.getElementById('importStateDetail').textContent = detail;
}

function applyMarginToAllItems() {
    const margin = safeNumber(state.marginPercent, 0);
    state.items.forEach((item) => {
        const sourcePrice = item.original?.netPrice ?? item.netPrice;
        item.netPrice = roundMoney(sourcePrice * (1 + margin / 100));
        item.preserveTotal = false;
    });
    updateCalculations();
}

function restoreImportedPrices() {
    state.marginPercent = 0;
    document.getElementById('marginPercent').value = '0';
    state.items.forEach((item) => {
        if (!item.original) return;
        item.catalogNetPrice = item.original.catalogNetPrice;
        item.discountPercent = item.original.discountPercent;
        item.netPrice = item.original.netPrice;
        item.netTotal = item.original.netTotal;
        item.preserveTotal = true;
    });
    updateCalculations();
}

function addNewItem() {
    const nextPosition = state.items.length
        ? Math.max(...state.items.map((item) => item.position)) + 1
        : 1;
    state.items.push({
        id: nextItemId++,
        position: nextPosition,
        name: 'Nowa pozycja',
        catalogIndex: '',
        qty: 1,
        unit: 'Szt.',
        catalogNetPrice: 0,
        discountPercent: 0,
        netPrice: 0,
        netTotal: 0,
        preserveTotal: false,
        sourcePage: null,
        original: null
    });
    updateCalculations();
}

function removeItem(id) {
    state.items = state.items.filter((item) => item.id !== id);
    updateCalculations();
}

function handleEditorChange(event) {
    const input = event.target.closest('[data-field]');
    if (!input) return;
    const item = state.items.find((candidate) => candidate.id === Number(input.dataset.id));
    if (!item) return;

    const field = input.dataset.field;
    const numericFields = new Set([
        'position', 'qty', 'catalogNetPrice', 'discountPercent', 'netPrice', 'netTotal'
    ]);
    const value = numericFields.has(field)
        ? safeNumber(input.value, 0)
        : input.value;

    item[field] = value;
    if (field === 'catalogNetPrice' || field === 'discountPercent') {
        item.netPrice = roundMoney(item.catalogNetPrice * (1 - item.discountPercent / 100));
        item.preserveTotal = false;
    } else if (field === 'qty' || field === 'netPrice') {
        item.preserveTotal = false;
    } else if (field === 'netTotal') {
        item.preserveTotal = true;
    }
    updateCalculations();
}

function updateCalculations() {
    let totalNetto = 0;
    state.items.forEach((item) => {
        if (!item.preserveTotal) {
            item.netTotal = roundMoney(item.qty * item.netPrice);
        }
        totalNetto = roundMoney(totalNetto + item.netTotal);
    });

    const totalVat = roundMoney(totalNetto * (safeNumber(state.vatPercent, 0) / 100));
    const totalBrutto = roundMoney(totalNetto + totalVat);

    renderEditorTable();
    renderPreviewDocument();
    updateSummary(totalNetto, totalVat, totalBrutto);
    updateSourceLabels();
}

function renderEditorTable() {
    const tbody = document.getElementById('itemsTableBody');
    if (!state.items.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="10">Brak pozycji. Wgraj ofertę PDF albo dodaj wiersz ręcznie.</td></tr>';
        return;
    }

    tbody.innerHTML = state.items.map((item) => `
        <tr>
            ${editorInputCell(item, 'position', item.position, 'number', 'cell-center', '1')}
            ${editorInputCell(item, 'name', item.name, 'textarea')}
            ${editorInputCell(item, 'catalogIndex', item.catalogIndex, 'text')}
            ${editorInputCell(item, 'qty', formatInputNumber(item.qty), 'number', 'cell-number', '0.01')}
            ${editorInputCell(item, 'unit', item.unit, 'text', 'cell-center')}
            ${editorInputCell(item, 'catalogNetPrice', moneyInput(item.catalogNetPrice), 'number', 'cell-number', '0.01')}
            ${editorInputCell(item, 'discountPercent', formatInputNumber(item.discountPercent), 'number', 'cell-number', '0.01')}
            ${editorInputCell(item, 'netPrice', moneyInput(item.netPrice), 'number', 'cell-number', '0.01')}
            ${editorInputCell(item, 'netTotal', moneyInput(item.netTotal), 'number', 'cell-number', '0.01')}
            <td><button class="remove-row" type="button" data-action="remove" data-id="${item.id}" title="Usuń pozycję">×</button></td>
        </tr>
    `).join('');
}

function editorInputCell(item, field, value, type, className = '', step = '') {
    if (type === 'textarea') {
        return `<td class="${className}"><textarea rows="2" data-id="${item.id}" data-field="${field}">${escapeHtml(String(value))}</textarea></td>`;
    }
    return `<td class="${className}"><input type="${type}" ${step ? `step="${step}"` : ''} data-id="${item.id}" data-field="${field}" value="${escapeHtml(String(value))}"></td>`;
}

function handleDocumentColumnChange(event) {
    const input = event.target.closest('[data-document-column]');
    if (!input) return;

    const key = input.dataset.documentColumn;
    const currentlyVisible = getVisibleDocumentColumns().length;
    if (!input.checked && currentlyVisible === 1) {
        input.checked = true;
        window.alert('W dokumencie musi zostać przynajmniej jedna kolumna.');
        return;
    }

    state.documentColumns[key] = input.checked;
    updateDocumentColumnCount();
    renderPreviewDocument();
}

function syncDocumentColumnControls() {
    document.querySelectorAll('[data-document-column]').forEach((input) => {
        input.checked = state.documentColumns[input.dataset.documentColumn] !== false;
    });
    updateDocumentColumnCount();
}

function updateDocumentColumnCount() {
    const visible = getVisibleDocumentColumns().length;
    document.getElementById('visibleColumnsCount').textContent =
        `${visible} z ${DOCUMENT_COLUMNS.length} widocznych`;
}

function getVisibleDocumentColumns() {
    return DOCUMENT_COLUMNS.filter((column) => state.documentColumns[column.key] !== false);
}

function renderPreviewDocument() {
    const paper = document.getElementById('pdfPaper');
    const placeholder = document.getElementById('previewPlaceholder');
    const hasItems = state.items.length > 0;
    paper.hidden = !hasItems;
    placeholder.hidden = hasItems;

    const visibleColumns = getVisibleDocumentColumns();
    const totalWeight = visibleColumns.reduce((sum, column) => sum + column.weight, 0);
    document.getElementById('docItemsTableColumns').innerHTML = visibleColumns
        .map((column) => `<col style="width:${(column.weight / totalWeight * 100).toFixed(3)}%">`)
        .join('');
    document.getElementById('docItemsTableHead').innerHTML = visibleColumns
        .map((column) => `<th data-align="${column.align}">${escapeHtml(column.label)}</th>`)
        .join('');

    const tbody = document.getElementById('docItemsTableBody');
    tbody.innerHTML = state.items.map((item) => `
        <tr>
            ${visibleColumns.map((column) => renderDocumentCell(column, item)).join('')}
        </tr>
    `).join('');
    requestAnimationFrame(updatePreviewScale);
}

function renderDocumentCell(column, item) {
    const values = {
        position: escapeHtml(String(item.position)),
        name: escapeHtml(item.name),
        catalogIndex: escapeHtml(item.catalogIndex || '-'),
        qty: formatNumber(item.qty),
        unit: escapeHtml(item.unit),
        catalogNetPrice: formatMoney(item.catalogNetPrice),
        discountPercent: `${formatNumber(item.discountPercent)}%`,
        netPrice: formatMoney(item.netPrice),
        netTotal: `<strong>${formatMoney(item.netTotal)}</strong>`
    };
    return `<td data-align="${column.align}">${values[column.key]}</td>`;
}

function updateSummary(totalNetto, totalVat, totalBrutto) {
    document.getElementById('itemsCountBadge').textContent = `${state.items.length} pozycji`;
    document.getElementById('summaryNetto').textContent = formatCurrency(totalNetto);
    document.getElementById('summaryVat').textContent = formatCurrency(totalVat);
    document.getElementById('summaryBrutto').textContent = formatCurrency(totalBrutto);
    document.getElementById('docSummaryNetto').textContent = formatCurrency(totalNetto);
    document.getElementById('docSummaryVat').textContent = formatCurrency(totalVat);
    document.getElementById('docSummaryBrutto').textContent = formatCurrency(totalBrutto);
    document.getElementById('docVatPercent').textContent = formatNumber(state.vatPercent);
    document.getElementById('docTotalInWords').textContent = numberToWordsPL(totalBrutto);
}

function updateSourceLabels() {
    const sourceTitle = document.getElementById('sourceFileLabel');
    const sourceMeta = document.getElementById('sourceFileMeta');
    const docSource = document.getElementById('docSourceFile');
    const docCount = document.getElementById('docImportedCount');

    if (state.sourceFileName) {
        sourceTitle.textContent = state.sourceFileName;
        sourceMeta.textContent = `${state.sourcePageCount} str. PDF · zachowane oryginalne numery pozycji`;
        docSource.textContent = `Źródło pozycji: ${state.sourceFileName}`;
    } else {
        sourceTitle.textContent = 'Brak wczytanego źródła';
        sourceMeta.textContent = 'Pozycje można dodać ręcznie.';
        docSource.textContent = 'Pozycje wprowadzone ręcznie';
    }
    docCount.textContent = `${state.items.length} pozycji`;
}

async function generatePDF() {
    if (!state.items.length) {
        window.alert('Dodaj lub wczytaj przynajmniej jedną pozycję.');
        return;
    }
    if (!window.html2pdf) {
        window.alert('Nie udało się załadować generatora PDF. Odśwież stronę.');
        return;
    }

    const paper = document.getElementById('pdfPaper');
    const downloadButton = document.getElementById('btnGeneratePDF');
    const originalButtonText = downloadButton.textContent;
    const filenamePart = (state.meta.offerNumber || 'oferta')
        .replace(/[^\p{L}\p{N}_-]+/gu, '_')
        .replace(/^_+|_+$/g, '');
    paper.classList.add('is-exporting');
    downloadButton.disabled = true;
    downloadButton.textContent = 'Tworzę PDF…';

    const baseOptions = {
        margin: 0,
        filename: `Oferta_Prescot_${filenamePart || 'oferta'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            removeContainer: true,
            scrollX: 0,
            scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: {
            mode: ['css', 'legacy'],
            avoid: ['tr', '.document-summary', '.document-terms']
        }
    };

    try {
        if (document.fonts?.ready) await document.fonts.ready;
        await waitForPaint();

        let saved = false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (attempt === 1) await waitForPaint(180);

            const options = {
                ...baseOptions,
                html2canvas: {
                    ...baseOptions.html2canvas,
                    scale: attempt === 0 ? 2 : 1.5
                }
            };
            const worker = window.html2pdf()
                .set(options)
                .from(paper)
                .toContainer()
                .toCanvas();
            const canvas = await worker.get('canvas');

            if (!canvasHasVisibleContent(canvas)) {
                releaseCanvas(canvas);
                continue;
            }

            await worker.toPdf();
            const pdfDocument = await worker.get('pdf');
            embedEditableOfferData(pdfDocument);
            await worker.save();
            releaseCanvas(canvas);
            saved = true;
            break;
        }

        if (!saved) {
            throw new Error('Generator dwukrotnie utworzył pusty obraz dokumentu.');
        }
    } catch (error) {
        console.error('Błąd eksportu PDF:', error);
        window.alert('Nie udało się utworzyć PDF-u. Dokument nie został pobrany. Spróbuj ponownie.');
    } finally {
        paper.classList.remove('is-exporting');
        downloadButton.disabled = false;
        downloadButton.textContent = originalButtonText;
    }
}

function embedEditableOfferData(pdfDocument) {
    if (!pdfDocument?.text || !pdfDocument?.setPage) return;

    const payload = {
        version: 1,
        items: state.items.map((item) => ({
            position: item.position,
            name: item.name,
            catalogIndex: item.catalogIndex,
            qty: item.qty,
            unit: item.unit,
            catalogNetPrice: item.catalogNetPrice,
            discountPercent: item.discountPercent,
            netPrice: item.netPrice,
            netTotal: item.netTotal,
            sourcePage: item.sourcePage
        })),
        meta: { ...state.meta },
        vatPercent: state.vatPercent,
        documentDataMode: state.documentDataMode,
        documentColumns: { ...state.documentColumns }
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = '';
    const byteChunkSize = 8192;
    for (let index = 0; index < bytes.length; index += byteChunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + byteChunkSize));
    }
    const encoded = window.btoa(binary);
    const dataChunkSize = 160;
    const chunks = [];
    for (let index = 0; index < encoded.length; index += dataChunkSize) {
        chunks.push(encoded.slice(index, index + dataChunkSize));
    }

    const pageCount = Math.max(1, pdfDocument.getNumberOfPages());
    pdfDocument.setFontSize(0.5);
    pdfDocument.setTextColor(255, 255, 255);
    chunks.forEach((chunk, index) => {
        const pageNumber = (index % pageCount) + 1;
        const lineNumber = Math.floor(index / pageCount);
        pdfDocument.setPage(pageNumber);
        pdfDocument.text(
            `${EMBEDDED_DATA_PREFIX}|${index + 1}|${chunks.length}|${chunk}`,
            0.5,
            296 - lineNumber * 0.35
        );
    });
}

function canvasHasVisibleContent(canvas) {
    if (!canvas?.width || !canvas?.height) return false;

    const sample = document.createElement('canvas');
    sample.width = 80;
    sample.height = 80;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return false;

    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let visiblePixels = 0;

    for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3];
        if (alpha > 0 && (red < 248 || green < 248 || blue < 248)) {
            visiblePixels += 1;
            if (visiblePixels >= 8) return true;
        }
    }
    return false;
}

function releaseCanvas(canvas) {
    if (!canvas) return;
    canvas.width = 1;
    canvas.height = 1;
}

function waitForPaint(delay = 0) {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (delay) window.setTimeout(resolve, delay);
                else resolve();
            });
        });
    });
}

function roundMoney(value) {
    return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function safeNumber(value, fallback = 0) {
    const parsed = typeof value === 'number' ? value : parseNumber(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value) {
    return safeNumber(value, 0).toLocaleString('pl-PL', {
        minimumFractionDigits: Number.isInteger(safeNumber(value, 0)) ? 0 : 2,
        maximumFractionDigits: 2
    });
}

function moneyInput(value) {
    return safeNumber(value, 0).toFixed(2);
}

function formatInputNumber(value) {
    const number = safeNumber(value, 0);
    return Number.isInteger(number) ? String(number) : String(number);
}

function formatMoney(value) {
    return safeNumber(value, 0).toLocaleString('pl-PL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatCurrency(value) {
    return `${formatMoney(value)} PLN`;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : dateString;
}

function localDateValue(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function numberToWordsPL(value) {
    const totalGrosze = Math.round(safeNumber(value, 0) * 100);
    const zlote = Math.floor(totalGrosze / 100);
    const grosze = totalGrosze % 100;
    const groszeText = String(grosze).padStart(2, '0');
    if (zlote === 0) return `zero złotych ${groszeText}/100`;

    const ones = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
    const teens = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
    const tens = ['', 'dziesięć', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
    const hundreds = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];

    const convertGroup = (number) => {
        const result = [];
        const hundred = Math.floor(number / 100);
        const ten = Math.floor((number % 100) / 10);
        const one = number % 10;
        if (hundred) result.push(hundreds[hundred]);
        if (ten === 1) result.push(teens[one]);
        else {
            if (ten > 1) result.push(tens[ten]);
            if (one) result.push(ones[one]);
        }
        return result.join(' ');
    };
    const form = (number, one, few, many) => {
        if (number === 1) return one;
        const lastTwo = number % 100;
        const last = number % 10;
        if (lastTwo >= 12 && lastTwo <= 14) return many;
        if (last >= 2 && last <= 4) return few;
        return many;
    };

    const parts = [];
    const millions = Math.floor(zlote / 1000000);
    const thousands = Math.floor((zlote % 1000000) / 1000);
    const rest = zlote % 1000;
    if (millions) {
        parts.push(convertGroup(millions), form(millions, 'milion', 'miliony', 'milionów'));
    }
    if (thousands) {
        if (thousands !== 1) parts.push(convertGroup(thousands));
        parts.push(form(thousands, 'tysiąc', 'tysiące', 'tysięcy'));
    }
    if (rest) parts.push(convertGroup(rest));
    parts.push(form(zlote, 'złoty', 'złote', 'złotych'));
    return `${parts.join(' ')} ${groszeText}/100`;
}
