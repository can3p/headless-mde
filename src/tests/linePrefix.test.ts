import {
    continuationPrefix,
    correctListMarker,
    formatLinePrefix,
    nextListMarker,
    parseLinePrefix,
    prefixLength,
} from '../lib/linePrefix';

describe('parseLinePrefix', () => {
    test.each([
        ['text', { quote: '', depth: 0, indent: '', list: null, content: 'text' }],
        ['  text', { quote: '', depth: 0, indent: '  ', list: null, content: 'text' }],
        ['- a', { quote: '', depth: 0, indent: '', list: { marker: '-', spacing: ' ' }, content: 'a' }],
        ['\t+  a', { quote: '', depth: 0, indent: '\t', list: { marker: '+', spacing: '  ' }, content: 'a' }],
        ['1.1. a', { quote: '', depth: 0, indent: '', list: { marker: '1.1.', spacing: ' ' }, content: 'a' }],
        ['12) a', { quote: '', depth: 0, indent: '', list: { marker: '12)', spacing: ' ' }, content: 'a' }],
        ['> - a', { quote: '> ', depth: 1, indent: '', list: { marker: '-', spacing: ' ' }, content: 'a' }],
        ['>> * a', { quote: '>> ', depth: 2, indent: '', list: { marker: '*', spacing: ' ' }, content: 'a' }],
        ['>', { quote: '>', depth: 1, indent: '', list: null, content: '' }],
        [
            '- [ ] task',
            { quote: '', depth: 0, indent: '', list: { marker: '-', spacing: ' ', checkbox: '[ ] ' }, content: 'task' },
        ],
        ['- [x]', { quote: '', depth: 0, indent: '', list: { marker: '-', spacing: ' ', checkbox: '[x]' }, content: '' }],
        ['- [] a', { quote: '', depth: 0, indent: '', list: { marker: '-', spacing: ' ' }, content: '[] a' }],
        ['-a', { quote: '', depth: 0, indent: '', list: null, content: '-a' }],
        ['1)a', { quote: '', depth: 0, indent: '', list: null, content: '1)a' }],
        ['**bold**', { quote: '', depth: 0, indent: '', list: null, content: '**bold**' }],
    ])('%j', (text, expected) => {
        expect(parseLinePrefix(text)).toEqual(expected);
    });

    test('counts only the given quote levels', () => {
        expect(parseLinePrefix('> > - a', 1)).toEqual({ quote: '> ', depth: 1, indent: '', list: null, content: '> - a' });
        expect(parseLinePrefix('> - a', 0)).toEqual({ quote: '', depth: 0, indent: '', list: null, content: '> - a' });
    });

    test('prefixLength is the length of the markup as written', () => {
        expect(prefixLength(parseLinePrefix('>>  - [ ] a'))).toBe('>>  - [ ] '.length);
        expect(prefixLength(parseLinePrefix('  text'))).toBe(2);
    });
});

describe('formatLinePrefix and continuationPrefix', () => {
    test.each([
        ['- a', '- '],
        ['* a', '* '],
        ['+ a', '+ '],
        ['1. a', '2. '],
        ['9) a', '10) '],
        ['1.1. a', '1.2. '],
        ['1.1) a', '1.2) '],
        ['  -   a', '  - '],
        ['>> - a', '>> - '],
        ['> > 1. a', '> > 2. '],
        ['- [x] a', '- [ ] '],
        ['> text', '> '],
    ])('%j continues with %j', (text, expected) => {
        expect(formatLinePrefix(continuationPrefix(parseLinePrefix(text)))).toBe(expected);
    });
});

test('nextListMarker', () => {
    expect(nextListMarker('-')).toBe('-');
    expect(nextListMarker('3.')).toBe('4.');
    expect(nextListMarker('3)')).toBe('4)');
    expect(nextListMarker('2.9)')).toBe('2.10)');
});

test('correctListMarker', () => {
    expect(correctListMarker('1)x')).toEqual({ length: 2, text: '1. ' });
    expect(correctListMarker('  1.1) x')).toEqual({ length: 7, text: '  1.1. ' });
    expect(correctListMarker('1.) x')).toEqual({ length: 4, text: '1. ' });
    expect(correctListMarker('1. x')).toBeNull();
    expect(correctListMarker('x 1)')).toBeNull();
});
