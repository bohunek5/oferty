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
let nextItemId = 1;

const state = {
    items: [],
    sourceFileName: '',
    sourcePageCount: 0,
    marginPercent: 0,
    vatPercent: 23,
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

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            setParsingStatus(true, `Czytam stronę ${pageNumber} z ${pdf.numPages}…`);
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            const textContent = await page.getTextContent();
            const pageItems = textContent.items
                .filter((item) => item.str && item.str.trim())
                .map((item) => ({
                    str: item.str.trim(),
                    x: item.transform[4],
                    y: item.transform[5],
                    width: Number(item.width) || 0,
                    height: Number(item.height) || 0
                }));

            extractedItems.push(...parsePageItems(pageItems, viewport.width, pageNumber));
        }

        const items = deduplicateAndSort(extractedItems);
        if (!items.length) {
            throw new Error('Nie znaleziono tabeli z pozycjami. Plik może być skanem albo mieć inny układ kolumn.');
        }

        state.items = items;
        state.sourceFileName = file.name;
        state.sourcePageCount = pdf.numPages;
        state.marginPercent = 0;
        document.getElementById('marginPercent').value = '0';

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

function parsePageItems(pageItems, pageWidth, pageNumber) {
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

function generatePDF() {
    if (!state.items.length) {
        window.alert('Dodaj lub wczytaj przynajmniej jedną pozycję.');
        return;
    }
    if (!window.html2pdf) {
        window.alert('Nie udało się załadować generatora PDF. Odśwież stronę.');
        return;
    }

    const paper = document.getElementById('pdfPaper');
    const filenamePart = (state.meta.offerNumber || 'oferta')
        .replace(/[^\p{L}\p{N}_-]+/gu, '_')
        .replace(/^_+|_+$/g, '');
    paper.classList.add('is-exporting');

    const options = {
        margin: 0,
        filename: `Oferta_Prescot_${filenamePart || 'oferta'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: {
            mode: ['css', 'legacy'],
            avoid: ['tr', '.document-summary', '.document-terms']
        }
    };

    window.html2pdf()
        .set(options)
        .from(paper)
        .save()
        .finally(() => paper.classList.remove('is-exporting'));
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
