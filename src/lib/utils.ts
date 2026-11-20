import { MutableRefObject } from 'react';

export const metaCombination = (...keys: string[]): string[] => {
    return [`command+${keys.join('+')}`, `ctrl+${keys.join('+')}`];
};

export const clamp = (val: number, min: number, max: number) => Math.min(Math.max(min, val), max);

export const findLast = <T>(
    array: Array<T>,
    predicate: (value: T, index: number, obj: T[]) => boolean,
): T | undefined => {
    let curIndex = array.length;
    while (curIndex--) {
        if (predicate(array[curIndex], curIndex, array)) return array[curIndex];
    }
    return undefined;
};

export const trimChars = (text: string, chars: string) => {
    return text.replace(new RegExp('^[' + escapeRegExp(chars) + ']+|[' + chars + ']+$', 'g'), '');
};

export const isBtwOrEq = (value: number, a: number, b: number) => {
    return value >= Math.min(a, b) && value <= Math.max(a, b);
};

/**
 * @param {HTMLTextAreaElement|HTMLInputElement} input
 * @param {string} value - The text to insert
 * @param {number} [selectionStart] - Optional start of selection range to replace
 * @param {number} [selectionEnd] - Optional end of selection range to replace
 * @returns {void}
 */
export function fireInput(
    input: HTMLTextAreaElement | HTMLInputElement,
    value: string,
    selectionStart?: number,
    selectionEnd?: number,
): void {
    // PATCH: Rewritten to use GitHub's approach - avoid select() to prevent Chrome scroll bug
    // Use surgical selection ranges and contentEditable trick for execCommand

    // If selection range provided, use it; otherwise replace all content
    const start = typeof selectionStart === 'number' ? selectionStart : 0;
    const end = typeof selectionEnd === 'number' ? selectionEnd : input.value.length;

    // Set selection to the range we want to replace
    input.selectionStart = start;
    input.selectionEnd = end;

    let isSuccess = false;

    // Try execCommand with contentEditable trick (GitHub's approach)
    if (document.execCommand) {
        input.contentEditable = 'true';
        try {
            isSuccess = document.execCommand('insertText', false, value);
        } catch {
            isSuccess = false;
        }
        input.contentEditable = 'false';
    }

    // Fallback: manual value manipulation
    if (!isSuccess) {
        // Try to preserve undo/redo for IE/Edge
        try {
            document.execCommand('ms-beginUndoUnit');
        } catch {
            // Ignore
        }

        // Manually replace the selected range
        const newValue = input.value.slice(0, start) + value + input.value.slice(end);
        input.value = newValue;

        try {
            document.execCommand('ms-endUndoUnit');
        } catch {
            // Ignore
        }

        // Manually dispatch input event
        const event = document.createEvent('UIEvent');
        event.initEvent('input', true, false);
        input.dispatchEvent(event);
    }

    // PATCH: Explicitly set cursor position after insertion (GitHub's approach)
    // Position cursor at the end of inserted text
    const newCursorPos = start + value.length;
    input.selectionStart = newCursorPos;
    input.selectionEnd = newCursorPos;
}

/**
 * 1. -> 2.
 * 1.1. -> 1.2.
 */
export const getIncrementedOrderedListPrefix = (prefix: string) => {
    const parts = trimChars(prefix.trim(), '.').split('.');
    const currentCount = parseInt(parts[parts.length - 1]);

    if (parts.length === 1) {
        return `${currentCount + 1}.`;
    }

    return `${parts.slice(0, -1).join('.')}.${currentCount + 1}.`;
};

export const isRefObject = <T>(ref: React.Ref<T>): ref is MutableRefObject<T> => {
    return ref !== null && typeof ref === 'object';
};

/** Will try to find textarea or throws an Error  */
export const findTextArea = (element: Element | null) => {
    const CHILDREN_ERROR_MSG =
        'TextareaMarkdown wrapper: child element must be instance of HTMLTextAreaElement or container with an textarea element';

    if (!element) {
        throw new TypeError(CHILDREN_ERROR_MSG);
    }

    if (element instanceof HTMLTextAreaElement) {
        return element;
    }

    const queried = element.querySelector('textarea');

    if (queried instanceof HTMLTextAreaElement) {
        return queried;
    }

    throw new TypeError(CHILDREN_ERROR_MSG);
};

export function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export const isInsideFencedCodeBlock = (value: string, cursorAt: number) => {
    let fence: { character: string; length: number } | null = null;

    for (const quotedLine of value.slice(0, cursorAt).split('\n')) {
        // a fence inside a blockquote opens or closes after the quote markers
        const line = splitQuotePrefix(quotedLine).rest;

        if (!fence) {
            const openingFence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
            if (openingFence) {
                fence = { character: openingFence[0], length: openingFence.length };
            }
            continue;
        }

        const { character: fenceCharacter, length: fenceLength } = fence;
        const indentation = line.length - line.trimStart().length;
        const closingFence = line.trim();
        if (
            indentation <= 3 &&
            closingFence.length >= fenceLength &&
            Array.from(closingFence).every((character) => character === fenceCharacter)
        ) {
            fence = null;
        }
    }

    return fence !== null;
};

export const isURL = (value: unknown): value is string => {
    try {
        return typeof value === 'string' && Boolean(new URL(value));
    } catch {
        return false;
    }
};

export const isImageURL = (value: unknown): value is string => {
    return isURL(value) && value.match(/\.(jpeg|jpg|gif|png)$/) !== null;
};

const QUOTE_PREFIX_RE = /^(?: {0,3}>[ \t]?)+/;

export type QuoteParts = {
    /** Blockquote markers at the start of the line, including the space after the last one, e.g. `> > ` */
    quote: string;
    /** Line content after the markers */
    rest: string;
    /** Nesting level, 0 when the line is not quoted */
    depth: number;
};

/** Splits a line into its blockquote markers and the content after them */
export const splitQuotePrefix = (text: string): QuoteParts => {
    const quote = QUOTE_PREFIX_RE.exec(text)?.[0] ?? '';
    return { quote, rest: text.slice(quote.length), depth: (quote.match(/>/g) ?? []).length };
};

/** Markers for a quoted line with content: always ends with a single space, `>>` becomes `>> ` */
export const quoteContinuation = (quote: string) => (quote === '' ? '' : quote.replace(/[ \t]*$/, ' '));

/** Markers for a quoted line without content (a paragraph break inside the quote): no trailing space */
export const quoteBlank = (quote: string) => quote.replace(/[ \t]*$/, '');

/** Markers with the innermost level removed: `> > ` becomes `>`, `> ` becomes `` */
export const quoteOuter = (quote: string) => quote.replace(/ {0,3}>[ \t]?$/, '');

/** Markers for a line with or without content */
export const quotePrefix = (quote: string, hasContent: boolean) =>
    hasContent ? quoteContinuation(quote) : quoteBlank(quote);
