import { Cursor } from '../lib/Cursor';
import { applyTextEdit, diffEdit, enterEdit, enterRules } from '../lib/enter';
import { defaultTextareaMarkdownOptions, TextareaMarkdownOptions } from '../lib/types';
import { formatContent, parseContent } from './notation';

/** Runs a plain Enter through `enterEdit`, in the notation of `notation.ts`; `null` when the textarea keeps it */
const enter = (input: string, options: Partial<TextareaMarkdownOptions> = {}) => {
    const all = { ...defaultTextareaMarkdownOptions, ...options };
    const { text, selectionStart, selectionEnd } = parseContent(input);
    const edit = enterEdit(
        text,
        selectionStart,
        selectionEnd,
        enterRules(all),
        all.enableOrderedListAutoCorrectExtension,
    );
    if (!edit) {
        return null;
    }
    const result = applyTextEdit(text, edit);
    const caret = result.indexOf(Cursor.MARKER);
    return formatContent(result.replace(Cursor.MARKER, ''), caret, caret);
};

const quotes = { enableBlockquoteExtension: true };
const noWrapping = { enablePrefixWrappingExtension: false };
const autoCorrect = { enableOrderedListAutoCorrectExtension: true };

describe('enterEdit: lists', () => {
    test.each([
        ['- a<>', {}, '- a\n- <>'],
        ['+ a<>', {}, '+ a\n+ <>'],
        ['1) a<>', {}, '1) a\n2) <>'],
        ['1.1) a<>', {}, '1.1) a\n1.2) <>'],
        ['\t- a<>', {}, '\t- a\n\t- <>'],
        ['- [ ] a<>', {}, '- [ ] a\n- [ ] <>'],
        ['- [x] a<>', {}, '- [x] a\n- [ ] <>'],
        ['- [ ] <>', {}, '\n<>'],
        ['- a\n- <>', {}, '- a\n\n<>'],
        ['- <>  ', {}, '\n<>'],
        ['&gt 1. <> ', {}, '&gt <>'],
        ['- a<bc>', {}, '- a\n- <>'],
        ['- ab<>cd', {}, '- ab\n- <>cd'],
        // lists inside quotes, whichever extension is on
        ['&gt - a<>', {}, '&gt - a\n&gt - <>'],
        ['&gt - a<>', quotes, '&gt - a\n&gt - <>'],
        ['&gt - a<>', { ...quotes, ...noWrapping }, '&gt - a\n&gt - <>'],
        ['&gt&gt 1. a<>', {}, '&gt&gt 1. a\n&gt&gt 2. <>'],
        ['&gt - <>', {}, '&gt <>'],
        ['&gt - <>', quotes, '&gt <>'],
    ])('%j %j', (input, options, expected) => {
        expect(enter(input, options)).toBe(expected);
    });

    test.each([
        ['<>- a', {}],
        ['1<>. a', {}],
        ['&gt <>- a', {}],
        ['text<>', {}],
        ['&gt text<>', {}],
        ['```\n- a<>', {}],
        ['&gt ```\n&gt - a<>', {}],
        ['- a<>', noWrapping],
        ['- a<>', { ...quotes, ...noWrapping }],
    ])('%j %j is left to the textarea', (input, options) => {
        expect(enter(input, options)).toBeNull();
    });

    test('a caret before the marker in a quote continues the quote', () => {
        expect(enter('&gt <>- a', quotes)).toBe('&gt \n&gt <>- a');
    });

    test('a list in a quoted code block only continues the quote', () => {
        expect(enter('&gt ```\n&gt - a<>', quotes)).toBe('&gt ```\n&gt - a\n&gt <>');
    });
});

describe('enterEdit: custom prefixes', () => {
    const checklist = { customPrefixWrapping: ['- [] '] };

    test.each([
        ['- [] a<>', checklist, '- [] a\n- [] <>'],
        ['- [] <>', checklist, '\n<>'],
        ['  - [] a<>', checklist, '  - [] a\n  - [] <>'],
        ['&gt - [] a<>', checklist, '&gt - [] a\n&gt - [] <>'],
        ['&gt - [] <>', checklist, '&gt <>'],
        ['&gt a<>', { customPrefixWrapping: ['> '] }, '&gt a\n&gt <>'],
        ['  :: a<>', { customPrefixWrapping: [{ prefix: ':: ', shouldSaveIndent: false }] }, '  :: a\n:: <>'],
        [':: <>', { customPrefixWrapping: [{ prefix: ':: ', shouldBreakIfEmpty: false }] }, ':: \n:: <>'],
        [
            'Q1: a<>',
            { customPrefixWrapping: [{ prefixPattern: /Q\d+: /, prefix: (line) => `Q${parseInt(line.text.slice(1)) + 1}: ` }] },
            'Q1: a\nQ2: <>',
        ],
    ])('%j %j', (input, options, expected) => {
        expect(enter(input, options)).toBe(expected);
    });

    test('a quote prefix leaves quotes to the blockquote extension', () => {
        const quotePrefix = { customPrefixWrapping: ['> '], ...quotes };
        expect(enter('&gt - a<>', quotePrefix)).toBe('&gt - a\n&gt - <>');
        expect(enter('&gt text\n&gt <>', quotePrefix)).toBe('&gt text\n&gt\n&gt <>');
        expect(enter('&gt a<>', quotePrefix)).toBe('&gt a\n&gt <>');
    });

    test('a function prefix gets a quoted line without its markers', () => {
        const numbered = {
            customPrefixWrapping: [{ prefixPattern: /Q\d+: /, prefix: (line: { text: string }) => `Q${parseInt(line.text.slice(1)) + 1}: ` }],
        };
        expect(enter('&gt Q1: a<>', numbered)).toBe('&gt Q1: a\n&gt Q2: <>');
    });

    test('a caret before a custom prefix is a plain line break', () => {
        expect(enter('- [<>] a', checklist)).toBe('- [\n<>] a');
        expect(enter('&gt - [<>] a', { ...checklist, ...quotes })).toBe('&gt - [\n&gt <>] a');
    });

    test('custom prefixes are off with prefix wrapping', () => {
        expect(enter('- [] a<>', { ...checklist, ...noWrapping })).toBeNull();
    });
});

describe('enterEdit: quotes', () => {
    test.each([
        ['&gt text<>', '&gt text\n&gt <>'],
        ['&gt text\n&gt <>', '&gt text\n&gt\n&gt <>'],
        ['&gt text\n&gt\n&gt <>', '&gt text\n\n<>'],
    ])('%j', (input, expected) => {
        expect(enter(input, quotes)).toBe(expected);
    });
});

describe('enterEdit: ordered list auto-correct', () => {
    test.each([
        ['1) a<>', autoCorrect, '1. a\n2. <>'],
        ['1)a<>', autoCorrect, '1. a\n2. <>'],
        ['1.1)a<>', autoCorrect, '1.1. a\n1.2. <>'],
        ['1.) a<>', autoCorrect, '1. a\n2. <>'],
        ['1)<>', autoCorrect, '\n<>'],
        ['1)ab<>cd', autoCorrect, '1. ab\n2. <>cd'],
        ['1<>)a', autoCorrect, '1. \n2. <>a'],
        ['&gt 1)a<>', autoCorrect, '&gt 1. a\n&gt 2. <>'],
        ['&gt 1)a<>', { ...autoCorrect, ...quotes, ...noWrapping }, '&gt 1. a\n&gt 2. <>'],
        ['1)a<>', { ...autoCorrect, ...noWrapping }, '1. a\n<>'],
        ['1) a<bc\nd>', autoCorrect, '1. a\n2. <>'],
    ])('%j %j', (input, options, expected) => {
        expect(enter(input, options)).toBe(expected);
    });

    test('leaves code blocks alone', () => {
        expect(enter('```\n1)a<>', autoCorrect)).toBeNull();
    });
});

test('diffEdit covers what changed', () => {
    expect(diffEdit('abcdef', 'aXYZcdef')).toEqual({ from: 1, to: 2, text: 'XYZ' });
    expect(diffEdit('1)a', '1. a\n2. ' + Cursor.MARKER)).toEqual({ from: 1, to: 3, text: '. a\n2. ' + Cursor.MARKER });
    expect(diffEdit('aa', 'aaa')).toEqual({ from: 2, to: 2, text: 'a' });
});
