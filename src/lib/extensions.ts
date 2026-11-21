import { Extension, PrefixWrappingConfig } from './types';
import {
    escapeRegExp,
    getIncrementedOrderedListPrefix,
    isBtwOrEq,
    isImageURL,
    isInsideFencedCodeBlock,
    isURL,
    metaCombination,
    mapQuotedContent,
    splitQuotePrefix,
} from './utils';
import { quoteBackspace, quoteEnter, quotePaste, TextEdit } from './blockquote';

import { Cursor } from './Cursor';
import { KeyboardShortcuts } from './keyboard';

/**
 * Whether a keydown is one the editor may take over: nothing handled it yet, it doesn't belong to an IME
 * composition (`keyCode` 229 is how Safari reports the composition-ending Enter) and no modifier is held.
 * `shift` included: `shift+enter` and `shift+backspace` keep the plain textarea behavior.
 */
const isPlainKeyPress = (event: KeyboardEvent) =>
    !event.defaultPrevented &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey;

/**
 * Handle the paste event, if the pasted text is a URL and something is selected, it will be converted to link/image markup.
 */
export const linkPasteExtension: Extension = (textarea) => {
    const cursor = new Cursor(textarea);

    const pasteListener = (event: ClipboardEvent) => {
        const LINK_MARKUP_RE = /\[[^\]]*\]\([^)]*\)/g;

        const clipboard = event?.clipboardData?.getData('text');

        // checks if selected is already inside link or image markup
        const isSelectedInLinkMarkup = (() => {
            if (!cursor.selection) {
                return false;
            }
            // get all links markup ranges
            const linkMarkupRangeList = Array.from(cursor.value.matchAll(LINK_MARKUP_RE)).map(
                (match) => [match.index!, match.index! + match[0].length] as const,
            );

            // check if selected text is inside any of those ranges
            return linkMarkupRangeList.some(
                ([start, end]) =>
                    isBtwOrEq(cursor.selection!.selectionStart, start, end) ||
                    isBtwOrEq(cursor.selection!.selectionEnd, start, end),
            );
        })();

        if (
            // make sure there is something on the clipboard
            !clipboard ||
            // make sure there is url on the clipboard
            !isURL(clipboard) ||
            // make sure there something is selected
            !cursor.selection ||
            // make selected text is not a URL
            isURL(cursor.selection.text) ||
            // make sure that selected is not inside link/image markup
            isSelectedInLinkMarkup
        ) {
            return;
        }

        // prevent default paste behavior
        event?.preventDefault();

        // workaround to avoid code copypaste
        if (isImageURL(clipboard)) {
            cursor.insert(`![${cursor.selection.text}](${clipboard}) ${Cursor.MARKER}`);
        } else {
            cursor.insert(`[${cursor.selection.text}](${clipboard}) ${Cursor.MARKER}`);
        }
    };

    textarea.addEventListener('paste', pasteListener);

    return () => textarea.removeEventListener('paste', pasteListener);
};

/**
 * Handle `tab`/`shift+tab` combination. Will insert or remove an intend depends on selection
 */
export const indentExtension: Extension = (textarea) => {
    const keyboard = new KeyboardShortcuts(textarea);
    const cursor = new Cursor(textarea);

    keyboard.bind('tab', (event) => {
        event?.preventDefault();
        const indent = ' '.repeat(4);

        if (!cursor.selection) {
            // If nothing is selected simply add Indent at the current position
            cursor.insert(`${indent}${Cursor.MARKER}`);
        } else {
            // If user is select line or lines - add Indent for each of this selected line, and keep selection
            // inside a blockquote the indentation goes after the quote markers
            cursor.replaceCurrentLines((line) => mapQuotedContent(line.text, (content) => indent + content), {
                selectReplaced: true,
            });
        }
    });

    keyboard.bind('shift+tab', (event) => {
        event?.preventDefault();
        cursor.replaceCurrentLines(
            (line) => mapQuotedContent(line.text, (content) => content.replace(/^\s{0,4}/, '')),
            // select lines if something was selected
            { selectReplaced: Boolean(cursor.selection) },
        );
    });

    return () => keyboard.reset();
};

/**
 * Handle next-line event. Will wrap current list sequence if needed
 */
export const prefixWrappingExtension: Extension = (textarea, options) => {
    const cursor = new Cursor(textarea);

    const ensureRegExp = (value: RegExp | string) =>
        value instanceof RegExp ? value : new RegExp(escapeRegExp(value));
    const getLineRegExp = (prefixRe: RegExp) => new RegExp(`^\\s*(${prefixRe.source}).*$`);

    const toConfig = (value: PrefixWrappingConfig | string): PrefixWrappingConfig =>
        typeof value === 'string' ? { prefix: value, prefixPattern: ensureRegExp(value) } : value;

    const getIndent = (text: string) => ' '.repeat(text.match(/^\s*/)?.[0].length ?? 0);

    const customConfigs = options.customPrefixWrapping.map(toConfig);

    const buildInConfigs: PrefixWrappingConfig[] = [
        {
            prefixPattern: /[-*]\s+/,
            prefix: (line) => {
                const match = /^\s*([-*])\s+/.exec(line.text);
                return match ? `${match[1]} ` : `${options.preferredUnorderedListSyntax} `;
            },
            shouldBreakIfEmpty: true,
            shouldSaveIndent: true,
        },
        {
            prefixPattern: /(\d+\.){1,2}\s+/,
            prefix: (line) =>
                getIncrementedOrderedListPrefix(/^(\s*((\d+\.){1,2})\s+.*)$/.exec(line.text)?.[2] ?? '') + ' ',
            shouldBreakIfEmpty: true,
            shouldSaveIndent: true,
        },
    ];

    const configs = [...customConfigs, ...buildInConfigs];

    const keydownListener = (event: KeyboardEvent) => {
        if (
            !isPlainKeyPress(event) ||
            event.code !== 'Enter' ||
            isInsideFencedCodeBlock(cursor.value, cursor.position.cursorAt)
        ) {
            return;
        }

        // entering line – is line on which the Enter was pressed
        const enteringLine = cursor.lineAt(cursor.position.line.lineNumber)!;

        const strictConfigs = configs.map((config) => {
            const prefix = config.prefix instanceof Function ? config.prefix(enteringLine) : config.prefix;
            const pattern = ensureRegExp(config.prefixPattern ?? prefix);
            const shouldBreak =
                config.shouldBreakIfEmpty === false ? false : !enteringLine.text.replace(pattern, '').trim();
            const shouldSaveIndent = config.shouldSaveIndent !== false;
            return { prefix, pattern, shouldBreak, shouldSaveIndent };
        });

        const matched = strictConfigs.find(({ pattern }) => getLineRegExp(pattern).test(enteringLine.text));

        if (!matched) {
            // no matches
            return;
        }

        const { prefix, shouldBreak, shouldSaveIndent } = matched;

        // the whole Enter is one edit, so it is one undo step, and nothing waits for a newline
        // that may never come (a replayed or prevented Enter, an IME commit)
        event.preventDefault();

        if (shouldBreak) {
            // a list line without content leaves the list
            cursor.replaceLine(enteringLine.lineNumber, '\n');
            return;
        }

        const indent = shouldSaveIndent ? getIndent(enteringLine.text) : '';
        cursor.insert(`\n${indent}${prefix}${Cursor.MARKER}`);
    };

    textarea.addEventListener('keydown', keydownListener);

    return () => textarea.removeEventListener('keydown', keydownListener);
};

export const emDashExtension: Extension = (textarea) => {
    const cursor = new Cursor(textarea);

    const keydownListener = (event: KeyboardEvent) => {
        if ((event.key !== ' ' && event.code !== 'Space') || cursor.selection) {
            return;
        }

        const cursorAt = cursor.position.cursorAt;
        if (cursor.value.slice(cursorAt - 2, cursorAt) !== '--' || isInsideFencedCodeBlock(cursor.value, cursorAt)) {
            return;
        }

        event.preventDefault();
        textarea.setSelectionRange(cursorAt - 2, cursorAt);
        cursor.insert(`— ${Cursor.MARKER}`);
    };

    textarea.addEventListener('keydown', keydownListener);
    return () => textarea.removeEventListener('keydown', keydownListener);
};

export const properLineRemoveBehaviorExtension: Extension = (textarea) => {
    const cursor = new Cursor(textarea);
    const keyboard = new KeyboardShortcuts(textarea);

    keyboard.bind(metaCombination('backspace'), (event) => {
        if (cursor.position.line.text === '') {
            event.preventDefault();
            cursor.replaceLine(cursor.position.line.lineNumber, null);
        }
    });

    return () => keyboard.reset();
};

export const orderedListAutoCorrectExtension: Extension = (textarea) => {
    const cursor = new Cursor(textarea);

    // eg: 1)content | 1) content | 1.1)content
    const INVALID_PATTERN = /^\s*(\d+(\.\d+)?\.?)\)\s*/;

    const handler = (event: KeyboardEvent) => {
        if (!isPlainKeyPress(event) || event.code !== 'Enter') {
            return;
        }

        const { quote, rest: lineText } = splitQuotePrefix(cursor.position.line.text);
        const match = lineText.match(INVALID_PATTERN);

        if (!match) {
            return;
        }

        event?.preventDefault();

        const indent = ' '.repeat(lineText.match(/^\s*/)?.[0].length ?? 0);
        const orderPrefix = match[1];
        const newLineContent = `${quote}${indent}${orderPrefix}. ${lineText.slice(match[0].length)}`;

        cursor.replaceLine(cursor.position.line.lineNumber, newLineContent);

        textarea.dispatchEvent(new KeyboardEvent('keydown', event));
    };

    textarea.addEventListener('keydown', handler);
    return () => textarea.removeEventListener('keydown', handler);
};

/**
 * Keeps blockquote markers in place while typing: Enter continues the quote, Backspace right after
 * the markers joins the line with the previous one, pasting several lines quotes each of them.
 * `shift+enter` and `shift+backspace` keep the plain textarea behavior.
 */
export const blockquoteExtension: Extension = (textarea) => {
    const cursor = new Cursor(textarea);

    const apply = (event: Event, edit: TextEdit | null) => {
        if (!edit) {
            return;
        }
        event.preventDefault();
        cursor.replaceRange(edit.from, edit.to, edit.text);
    };

    const keydownListener = (event: KeyboardEvent) => {
        if (!isPlainKeyPress(event)) {
            return;
        }

        const { value, selectionStart, selectionEnd } = textarea;

        if (event.key === 'Enter') {
            apply(event, quoteEnter(value, selectionStart, selectionEnd));
        } else if (event.key === 'Backspace') {
            apply(event, quoteBackspace(value, selectionStart, selectionEnd));
        }
    };

    const pasteListener = (event: ClipboardEvent) => {
        const data = event.clipboardData;
        if (event.defaultPrevented || !data || data.files.length > 0) {
            return;
        }

        const { value, selectionStart, selectionEnd } = textarea;
        apply(event, quotePaste(value, selectionStart, selectionEnd, data.getData('text/plain')));
    };

    textarea.addEventListener('keydown', keydownListener);
    textarea.addEventListener('paste', pasteListener);

    return () => {
        textarea.removeEventListener('keydown', keydownListener);
        textarea.removeEventListener('paste', pasteListener);
    };
};
