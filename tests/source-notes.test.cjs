const test = require('node:test');
const assert = require('node:assert/strict');
const { extract, blocks } = require('../source-notes.js');
const page = lines => lines.map((str, i) => ({ str, x: 30, y: 700 - i * 14, height: 10 }));

test('extracts document notes and stops before signatures', () => {
    assert.equal(extract([page(['Oferta', 'Uwagi:', 'Dostawa w ciągu 7 dni.', '- Transport po uzgodnieniu.', 'Podpis i pieczęć', 'Jan Kowalski'])]), 'Dostawa w ciągu 7 dni.\n- Transport po uzgodnieniu.');
});
test('extracts inline descriptions and split PDF heading tokens', () => {
    assert.equal(extract([page(['Opis dokumentu: Dostawa do magazynu.', 'Wjazd od północy.'])]), 'Dostawa do magazynu.\nWjazd od północy.');
    assert.equal(extract([[{ str: 'Uwagi', x: 20, y: 700 }, { str: ':', x: 60, y: 700 }, { str: 'Przedpłata.', x: 70, y: 700 }]]), 'Przedpłata.');
});
test('does not confuse a description column or product name with document notes', () => {
    assert.equal(extract([page(['Lp. Opis Ilość Cena netto', '1 Taśma LED 5 m 10 PLN', 'Opis produktu: taśma LED'])]), '');
});
test('keeps notes from separate pages without taking unlabelled headers', () => {
    assert.equal(extract([page(['Uwagi: Dostawa w piątek.']), page(['OFERTA 123', 'Uwagi dodatkowe:', 'Kontakt przed dostawą.', 'Strona 2 z 2'])]), 'Dostawa w piątek.\n\nKontakt przed dostawą.');
});
test('preserves paragraphs, original numbering and multiline bullets', () => {
    assert.deepEqual(blocks('Dostawa.\n\n- Pierwszy punkt\nciąg dalszy\n- Drugi punkt\n\n3. Trzeci\n7. Siódmy'), [
        { type: 'paragraph', text: 'Dostawa.' },
        { type: 'list', ordered: false, items: [{ text: 'Pierwszy punkt\nciąg dalszy', number: null }, { text: 'Drugi punkt', number: null }] },
        { type: 'list', ordered: true, items: [{ text: 'Trzeci', number: 3 }, { text: 'Siódmy', number: 7 }] }
    ]);
});
test('source markup stays literal text and empty content has no blocks', () => {
    assert.deepEqual(blocks('<img src=x onerror=alert(1)>'), [{ type: 'paragraph', text: '<img src=x onerror=alert(1)>' }]);
    assert.deepEqual(blocks(' \n '), []);
});
