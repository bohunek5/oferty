/* Read document-level notes, independently of the product table parser. */
(function (root) {
    'use strict';

    const heading = /^(?:uwagi(?:\s+(?:do\s+(?:oferty|dokumentu)|dodatkowe))?|opis(?:\s+(?:oferty|dokumentu|dodatkowy))?|informacje dodatkowe|notes|remarks)(?:\s*[:：]\s*(.*)|\s*)$/i;
    const ending = /^(?:(?:razem|suma|wartość)\s+(?:netto|brutto|vat)|do zapłaty|słownie|warunki płatności|forma płatności|termin płatności|podpis|podpis i pieczęć|wystawił|sporządził|odebrał|osoba (?:upoważniona|wystawiająca)|numer (?:rachunku|konta)|rachunek bankowy|nip\s*:|regon\s*:|krs\s*:|strona\s+\d|page\s+\d)/i;

    function clean(value) {
        return String(value || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
            .split('\n').map(line => line.trimEnd()).join('\n').trim();
    }

    function linesFromItems(items) {
        const lines = [];
        for (const item of [...items].filter(item => item.str?.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
            const tolerance = Math.max(2, Math.min(4, (item.height || 10) * 0.3));
            let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= tolerance);
            if (!line) {
                line = { y: item.y, height: item.height || 10, items: [] };
                lines.push(line);
            }
            line.items.push(item);
            line.height = Math.max(line.height, item.height || 10);
        }
        return lines.map(line => ({ ...line, text: clean(line.items.sort((a, b) => a.x - b.x).map(item => item.str).join(' ')) }));
    }

    function extract(pages) {
        const sections = [];
        for (const items of pages) {
            let current = null;
            let previous = null;
            for (const line of linesFromItems(items)) {
                const match = line.text.match(heading);
                if (match) {
                    current = [];
                    sections.push(current);
                    if (match[1]) current.push(match[1]);
                } else if (current) {
                    // A new table/header or document footer ends a note section.
                    if (ending.test(line.text) || /^(?:lp\.?|poz\.?)\s+.*(?:nazwa|opis|indeks)/i.test(line.text)) {
                        current = null;
                    } else {
                        if (previous && previous.y - line.y > Math.max(previous.height, line.height) * 1.8) current.push('');
                        current.push(line.text);
                    }
                }
                previous = line;
            }
        }
        return sections.map(section => clean(section.join('\n'))).filter(Boolean).join('\n\n');
    }

    // Return plain text blocks; the view inserts textContent, never source HTML.
    function blocks(value) {
        const result = [];
        let paragraph = [];
        let list = null;
        const flush = () => {
            if (paragraph.length) result.push({ type: 'paragraph', text: paragraph.join('\n') });
            paragraph = [];
            list = null;
        };
        for (const line of clean(value).split('\n')) {
            const bullet = line.match(/^\s*(?:[-•●▪‣–]\s+|(?:\d+)[.)]\s+)(.+)$/);
            if (!line.trim()) {
                flush();
            } else if (bullet) {
                const ordered = /^\s*\d/.test(line);
                if (!list || list.ordered !== ordered) {
                    flush();
                    list = { type: 'list', ordered, items: [] };
                    result.push(list);
                }
                // Keep original numbering (including non-consecutive source numbers).
                list.items.push({ text: bullet[1], number: ordered ? Number.parseInt(line, 10) : null });
            } else if (list) {
                list.items[list.items.length - 1].text += '\n' + line.trim();
            } else {
                paragraph.push(line);
            }
        }
        flush();
        return result;
    }

    const api = { clean, extract, blocks };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.OfferSourceNotes = api;
})(typeof window === 'undefined' ? globalThis : window);
