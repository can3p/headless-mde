import { Cursor } from '../lib/Cursor';
import { backspaceRules } from '../lib/backspace';
import { bootstrapTextareaMarkdown } from '../lib/bootstrap';
import { applyTextEdit, caretContext, firstEdit } from '../lib/caretContext';
import { defaultTextareaMarkdownOptions, TextareaMarkdownOptions } from '../lib/types';
import { formatContent, parseContent } from './notation';

/** Runs a plain Backspace through the rules, in the notation of `notation.ts`; `null` when the textarea keeps it */
const backspace = (input: string, options: Partial<TextareaMarkdownOptions> = {}) => {
    const { text, selectionStart, selectionEnd } = parseContent(input);
    const rules = backspaceRules({ ...defaultTextareaMarkdownOptions, ...options });
    const edit = firstEdit(caretContext(text, selectionStart, selectionEnd), rules);
    if (!edit) {
        return null;
    }
    const result = applyTextEdit(text, edit);
    const caret = result.indexOf(Cursor.MARKER);
    return formatContent(result.replace(Cursor.MARKER, ''), caret, caret);
};

const quotes = { enableBlockquoteExtension: true };
const noWrapping = { enablePrefixWrappingExtension: false };

describe('backspace after a list marker', () => {
    test.each([
        // joins with the item above
        ['- a\n- <>b', {}, '- a <>b'],
        ['- a \n- <>b', {}, '- a <>b'],
        ['* a\n* <>b', {}, '* a <>b'],
        ['1. a\n2. <>b', {}, '1. a <>b'],
        ['1) a\n2) <>b', {}, '1) a <>b'],
        ['1.1. a\n1.2. <>b', {}, '1.1. a <>b'],
        ['- [ ] a\n- [ ] <>b', {}, '- [ ] a <>b'],
        ['- \n- <>b', {}, '- <>b'],
        // a deeper item above counts too
        ['- a\n    - x\n- <>b', {}, '- a\n    - x <>b'],
        // an empty item undoes an Enter
        ['- a\n- <>', {}, '- a<>'],
        ['- a\n- <>\n- c', {}, '- a<>\n- c'],
        ['1. a\n2. <>', {}, '1. a<>'],
        // in a quote, with the quote markers kept
        ['&gt - a\n&gt - <>b', {}, '&gt - a <>b'],
        ['&gt - a\n&gt - <>b', quotes, '&gt - a <>b'],
        ['&gt&gt - a\n&gt &gt - <>b', quotes, '&gt&gt - a <>b'],
        // the first item: removes the marker
        ['- <>b', {}, '<>b'],
        ['text\n- <>b', {}, 'text\n<>b'],
        ['- a\n\n- <>b', {}, '- a\n\n<>b'],
        ['&gt - <>b', quotes, '&gt <>b'],
        ['- a\n&gt - <>b', quotes, '- a\n&gt <>b'],
        // without a parent item the indent goes too, so it doesn't become an indented code block
        ['\n    - <>b', {}, '\n<>b'],
        // nested: outdents to the parent item's indent
        ['- a\n    - <>b', {}, '- a\n- <>b'],
        ['- a\n  - b\n    - <>c', {}, '- a\n  - b\n  - <>c'],
        ['1. a\n   - <>b', {}, '1. a\n- <>b'],
        ['- a\n    - <>', {}, '- a\n- <>'],
        ['- a\n    - [x] <>b', {}, '- a\n- [x] <>b'],
        ['&gt - a\n&gt     - <>b', quotes, '&gt - a\n&gt - <>b'],
        // only lists in a quote with just the blockquote extension
        ['&gt - a\n&gt - <>b', { ...quotes, ...noWrapping }, '&gt - a <>b'],
    ])('%j %j', (input, options, expected) => {
        expect(backspace(input, options)).toBe(expected);
    });

    test.each([
        // the caret elsewhere
        ['- a\n-<> b', {}],
        ['- a\n- b<>', {}],
        ['- a\n<>- b', {}],
        ['- a\n- [ ]<> b', {}],
        // a selection
        ['- a\n- <b>', {}],
        // a code block
        ['```\n- a\n- <>b', {}],
        // not a list
        ['text\n<>b', {}],
        // lists outside a quote need prefix wrapping
        ['- a\n- <>b', { ...quotes, ...noWrapping }],
        ['- a\n- <>b', noWrapping],
        ['&gt - a\n&gt - <>b', noWrapping],
    ])('%j %j keeps the plain backspace', (input, options) => {
        expect(backspace(input, options)).toBeNull();
    });

    test('the quote rule still takes a caret right after quote markers', () => {
        expect(backspace('&gt a\n&gt <>b', quotes)).toBe('&gt a <>b');
        expect(backspace('&gt <>- b', quotes)).toBe('<>- b');
    });
});

describe('backspaceExtension', () => {
    const setup = (notation: string, options: Partial<TextareaMarkdownOptions> = {}) => {
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        const { text, selectionStart, selectionEnd } = parseContent(notation);
        textarea.value = text;
        textarea.setSelectionRange(selectionStart, selectionEnd);
        const { dispose } = bootstrapTextareaMarkdown(textarea, { options });
        const press = (init: KeyboardEventInit = {}) => {
            const event = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true, ...init });
            textarea.dispatchEvent(event);
            return event;
        };
        const value = () => formatContent(textarea.value, textarea.selectionStart, textarea.selectionEnd);
        return { press, value, dispose };
    };

    test('joins list items by default', () => {
        const { press, value, dispose } = setup('- a\n- <>b');
        expect(press().defaultPrevented).toBe(true);
        expect(value()).toBe('- a <>b');
        dispose();
    });

    test.each([{ shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }])(
        'leaves %j to the textarea',
        (init) => {
            const { press, value, dispose } = setup('- a\n- <>b', { enableProperLineRemoveBehaviorExtension: false });
            expect(press(init).defaultPrevented).toBe(false);
            expect(value()).toBe('- a\n- <>b');
            dispose();
        },
    );

    test('binds nothing with prefix wrapping and blockquotes off', () => {
        const { press, value, dispose } = setup('- a\n- <>b', { enablePrefixWrappingExtension: false });
        expect(press().defaultPrevented).toBe(false);
        expect(value()).toBe('- a\n- <>b');
        dispose();
    });

    test('dispose removes the listener', () => {
        const { press, value, dispose } = setup('- a\n- <>b');
        dispose();
        expect(press().defaultPrevented).toBe(false);
        expect(value()).toBe('- a\n- <>b');
    });
});

describe('properLineRemoveBehaviorExtension', () => {
    const setup = (notation: string) => {
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        const { text, selectionStart, selectionEnd } = parseContent(notation);
        textarea.value = text;
        textarea.setSelectionRange(selectionStart, selectionEnd);
        const { dispose } = bootstrapTextareaMarkdown(textarea, {});
        const press = (init: KeyboardEventInit) => {
            const event = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true, ...init });
            textarea.dispatchEvent(event);
            return event;
        };
        const value = () => formatContent(textarea.value, textarea.selectionStart, textarea.selectionEnd);
        return { press, value, dispose };
    };

    test.each([{ ctrlKey: true }, { metaKey: true }])('%j removes an empty line', (init) => {
        const { press, value, dispose } = setup('a\n<>\nbc');
        expect(press(init).defaultPrevented).toBe(true);
        expect(value()).toBe('a<>\nbc');
        dispose();
    });

    test.each([{ ctrlKey: true }, { metaKey: true }])(
        '%j leaves a selection that starts on an empty line to the textarea',
        (init) => {
            const { press, value, dispose } = setup('a\n<\nbc>');
            expect(press(init).defaultPrevented).toBe(false);
            expect(value()).toBe('a\n<\nbc>');
            dispose();
        },
    );
});
