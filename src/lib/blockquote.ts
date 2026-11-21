import { Cursor, Line } from './Cursor';
import {
    getIncrementedOrderedListPrefix,
    getLines,
    openFenceAt,
    QuoteParts,
    quoteBlank,
    quoteContinuation,
    quoteOuter,
    quotePrefix,
    splitQuotePrefix,
    takeQuoteLevels,
} from './utils';

/**
 * A replacement of `value.slice(from, to)` with `text`.
 * `text` carries a `Cursor.MARKER` where the caret goes.
 */
export type TextEdit = {
    from: number;
    to: number;
    text: string;
};

const M = Cursor.MARKER;

const LIST_ITEM_RE = /^(\s*)([-*+]|\d+(?:\.\d+)?[.)])(\s+)(.*)$/;

type QuotedCaret = {
    line: Line;
    /** Caret offset inside the line */
    column: number;
    parts: QuoteParts;
    /** The line above with its quote parts, `null` on the first line */
    prev: { line: Line; parts: QuoteParts } | null;
    /** Caret is inside a fenced code block that lives in this quote */
    inCode: boolean;
};

/**
 * Describes a collapsed caret placed after the quote markers of a quoted line, `null` otherwise.
 * Inside a code block only the markers of the quote holding the block count, the rest is code:
 * in a code block outside any quote there are no markers at all.
 */
const quotedCaretAt = (value: string, start: number, end: number): QuotedCaret | null => {
    if (start !== end) {
        return null;
    }

    const lines = getLines(value);
    const index = lines.findIndex((line) => start >= line.startsAt && start <= line.endsAt);
    const line = lines[index];
    const fence = openFenceAt(value, start);
    const parts = fence ? takeQuoteLevels(line.text, fence.depth) : splitQuotePrefix(line.text);
    const column = start - line.startsAt;

    if (parts.depth === 0 || column < parts.quote.length) {
        return null;
    }

    const prevLine = index > 0 ? lines[index - 1] : null;
    return {
        line,
        column,
        parts,
        prev: prevLine && { line: prevLine, parts: splitQuotePrefix(prevLine.text) },
        inCode: fence !== null,
    };
};

/** The marker of the next list item: `-` stays `-`, `1.` becomes `2.`, `1)` becomes `2)` */
const nextListMarker = (marker: string) => {
    if (/^[-*+]$/.test(marker)) {
        return marker;
    }
    if (marker.endsWith(')')) {
        return `${parseInt(marker) + 1})`;
    }
    return getIncrementedOrderedListPrefix(marker);
};

/** Enter on a quoted line without content */
const enterOnEmptyQuoteLine = ({ line, parts, prev }: QuotedCaret): TextEdit => {
    const outer = quoteOuter(parts.quote);

    if (!prev || prev.parts.depth < parts.depth) {
        // the quote starts on this line: leave it
        return { from: line.startsAt, to: line.endsAt, text: quotePrefix(outer, true) + M };
    }

    if (prev.parts.depth === parts.depth && prev.parts.rest.trim() === '') {
        // second empty line in a row: leave one quote level, keeping a blank line between
        return {
            from: prev.line.startsAt,
            to: line.endsAt,
            text: `${quoteBlank(outer)}\n${quotePrefix(outer, true)}${M}`,
        };
    }

    // first empty line: paragraph break inside the quote
    return { from: line.startsAt, to: line.endsAt, text: `${quoteBlank(parts.quote)}\n${quoteContinuation(parts.quote)}${M}` };
};

/** Enter on a list item inside a quote, `null` when the line is not a list item */
const enterOnQuotedListItem = (caret: QuotedCaret, start: number): TextEdit | null => {
    const { line, column, parts } = caret;
    const item = LIST_ITEM_RE.exec(parts.rest);
    if (!item) {
        return null;
    }

    const [, indent, marker, spacing, content] = item;
    const contentColumn = parts.quote.length + indent.length + marker.length + spacing.length;
    if (column < contentColumn) {
        // caret before the content: the marker moves to the new line with the text after the caret
        return null;
    }

    const cont = quoteContinuation(parts.quote);
    if (content.trim() === '') {
        // empty list item: leave the list, stay in the quote
        return { from: line.startsAt, to: line.endsAt, text: cont + M };
    }

    return { from: start, to: start, text: `\n${cont}${indent}${nextListMarker(marker)} ${M}` };
};

/**
 * Enter on a quoted line:
 * - continues the quote at the same depth, and a list inside it
 * - on an empty list item leaves the list but stays in the quote
 * - on an empty quote line after text makes a paragraph break (`>` line)
 * - on an empty quote line after a paragraph break leaves one quote level
 * - on an empty quote line that starts the quote removes the markers
 * - inside a code block in the quote only continues the quote
 */
export const quoteEnter = (value: string, start: number, end: number): TextEdit | null => {
    const caret = quotedCaretAt(value, start, end);
    if (!caret) {
        return null;
    }

    const continueQuote = { from: start, to: end, text: `\n${quoteContinuation(caret.parts.quote)}${M}` };

    if (caret.inCode) {
        return continueQuote;
    }
    if (caret.parts.rest.trim() === '') {
        return enterOnEmptyQuoteLine(caret);
    }
    return enterOnQuotedListItem(caret, start) ?? continueQuote;
};

/**
 * Backspace with the caret right after the quote markers:
 * - on an empty quoted line removes the line
 * - after a paragraph break (`>` line) removes the break
 * - after a quoted line with text joins both lines with a space
 * - on the first line of a quote, or below a shallower quote, removes one quote level
 * Inside a code block it keeps the plain behavior.
 */
export const quoteBackspace = (value: string, start: number, end: number): TextEdit | null => {
    const caret = quotedCaretAt(value, start, end);
    if (!caret || caret.inCode || caret.column !== caret.parts.quote.length) {
        return null;
    }

    const { line, parts, prev } = caret;
    const contentStart = line.startsAt + parts.quote.length;

    // a deeper line above counts too: in markdown this line already continues that paragraph
    if (prev && prev.parts.depth >= parts.depth) {
        if (parts.rest.trim() === '') {
            return { from: prev.line.endsAt, to: line.endsAt, text: M };
        }

        if (prev.parts.rest.trim() === '') {
            return { from: prev.line.startsAt, to: contentStart, text: parts.quote + M };
        }

        const separator = /\s$/.test(prev.line.text) ? '' : ' ';
        return { from: prev.line.endsAt, to: contentStart, text: separator + M };
    }

    return {
        from: line.startsAt,
        to: contentStart,
        text: quotePrefix(quoteOuter(parts.quote), parts.rest !== '') + M,
    };
};

/**
 * Paste of several lines into a quote: every pasted line gets the quote markers,
 * blank lines become paragraph breaks (`>` lines). Inside a code block in the quote
 * lines get the markers as they are.
 */
export const quotePaste = (value: string, start: number, end: number, clipboard: string): TextEdit | null => {
    const pasted = clipboard.replace(/\r\n?/g, '\n');
    if (!pasted.includes('\n')) {
        return null;
    }

    // the caret may sit on a selection: describe its start
    const caret = quotedCaretAt(value, start, start);
    if (!caret) {
        return null;
    }

    const { quote } = caret.parts;
    const pastedLines = pasted.split('\n');
    const text = pastedLines
        .map((l, index) => {
            if (index === 0) {
                return l;
            }
            // the last line continues with the text after the caret, so it keeps the full markers
            const isLast = index === pastedLines.length - 1;
            return quotePrefix(quote, caret.inCode || l.trim() !== '' || isLast) + l;
        })
        .join('\n');

    return { from: start, to: end, text: text + M };
};
