import { MutableRefObject } from 'react';
import type { Line } from './Cursor';

export const metaCombination = (...keys: string[]): string[] => {
    return [`command+${keys.join('+')}`, `ctrl+${keys.join('+')}`];
};

/**
 * Splits text into lines with their 1-based numbers and offsets, `endsAt` excludes the line break.
 * Splits on `\n` only: text is LF-only, as a textarea gives it, a `\r` would stay in the line.
 */
export const getLines = (value: string): Line[] => {
    let startsAt = 0;
    return value.split('\n').map((text, index) => {
        const line = { text, lineNumber: index + 1, startsAt, endsAt: startsAt + text.length };
        startsAt += text.length + 1;
        return line;
    });
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
    // avoid select() to prevent the Chrome scroll bug, replace only the given range

    // If selection range provided, use it; otherwise replace all content
    const start = typeof selectionStart === 'number' ? selectionStart : 0;
    const end = typeof selectionEnd === 'number' ? selectionEnd : input.value.length;

    // Set selection to the range we want to replace
    input.selectionStart = start;
    input.selectionEnd = end;

    let isSuccess = false;

    // a native edit keeps the undo history. `execCommand` edits the focused element, so only use it when
    // that's the input (in its own document or shadow root). A focused textarea needs no contentEditable
    // trick (that made WebKit scroll to the end of the text); Firefox supports it since version 89.
    const ownerDocument = input.ownerDocument;
    const root = input.getRootNode() as Document | ShadowRoot;
    if (ownerDocument.execCommand && root.activeElement === input) {
        try {
            isSuccess = ownerDocument.execCommand('insertText', false, value);
        } catch {
            isSuccess = false;
        }
    }

    // Fallback (no execCommand, as in jsdom, or the input isn't focused): set the value, without undo.
    // The prototype's setter bypasses the value tracker of React, so a controlled component's onChange fires.
    if (!isSuccess) {
        const newValue = input.value.slice(0, start) + value + input.value.slice(end);
        const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
        if (setValue) {
            setValue.call(input, newValue);
        } else {
            input.value = newValue;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
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

export type OpenFence = {
    character: string;
    length: number;
    /** Quote depth of the line that opened the fence, the fence lives inside that quote */
    depth: number;
};

/**
 * Finds the fenced code block open at `cursorAt`, `null` outside a code block. `value` is LF-only text.
 * A fence opened inside a blockquote is closed by its closing fence or by the end of the quote,
 * and `>` inside a code block is code, not a quote marker.
 */
export const openFenceAt = (value: string, cursorAt: number): OpenFence | null => {
    let fence: OpenFence | null = null;

    for (const line of value.slice(0, cursorAt).split('\n')) {
        if (fence) {
            const inside = takeQuoteLevels(line, fence.depth);

            if (inside.depth < fence.depth) {
                // the quote holding the fence has ended, so has the code block
                fence = null;
            } else {
                const indentation = inside.rest.length - inside.rest.trimStart().length;
                const closingFence = inside.rest.trim();
                if (
                    indentation <= 3 &&
                    closingFence.length >= fence.length &&
                    Array.from(closingFence).every((character) => character === fence!.character)
                ) {
                    fence = null;
                }
                continue;
            }
        }

        const { rest, depth } = splitQuotePrefix(line);
        const openingFence = /^ {0,3}(`{3,}|~{3,})/.exec(rest)?.[1];
        if (openingFence) {
            fence = { character: openingFence[0], length: openingFence.length, depth };
        }
    }

    return fence;
};

export const isInsideFencedCodeBlock = (value: string, cursorAt: number) => openFenceAt(value, cursorAt) !== null;

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

const QUOTE_LEVEL_RE = /^ {0,3}>[ \t]?/;

/**
 * Splits off at most `levels` quote levels, the rest of the markers stay in `rest`.
 * `depth` is the number of levels split off.
 */
export const takeQuoteLevels = (text: string, levels: number): QuoteParts => {
    let quote = '';
    let depth = 0;
    while (depth < levels) {
        const level = QUOTE_LEVEL_RE.exec(text.slice(quote.length))?.[0];
        if (!level) {
            break;
        }
        quote += level;
        depth++;
    }
    return { quote, rest: text.slice(quote.length), depth };
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

/** Applies `transform` to the content of a line, keeping its blockquote markers */
export const mapQuotedContent = (text: string, transform: (content: string) => string) => {
    const { quote, rest } = splitQuotePrefix(text);
    return quote + transform(rest);
};

/** Markers for a line with or without content */
export const quotePrefix = (quote: string, hasContent: boolean) =>
    hasContent ? quoteContinuation(quote) : quoteBlank(quote);
