import { Cursor } from './Cursor';
import {
    getIncrementedOrderedListPrefix,
    isInsideFencedCodeBlock,
    quoteBlank,
    quoteContinuation,
    quoteOuter,
    quotePrefix,
    splitQuotePrefix,
} from './utils';

/**
 * A replacement of `value.slice(from, to)` with `text`.
 * `text` carries a `Cursor.MARKER` where the caret goes.
 */
export type QuoteEdit = {
    from: number;
    to: number;
    text: string;
};

type TextLine = {
    text: string;
    startsAt: number;
    endsAt: number;
};

const M = Cursor.MARKER;

const LIST_ITEM_RE = /^(\s*)([-*+]|\d+(?:\.\d+)?[.)])(\s+)(.*)$/;

const splitLines = (value: string): TextLine[] => {
    let startsAt = 0;
    return value.split('\n').map((text) => {
        const line = { text, startsAt, endsAt: startsAt + text.length };
        startsAt += text.length + 1;
        return line;
    });
};

/** Finds the quoted line holding a collapsed caret, `null` when the caret is not after quote markers */
const quotedLineAt = (value: string, start: number, end: number) => {
    if (start !== end) {
        return null;
    }

    const lines = splitLines(value);
    const index = lines.findIndex((line) => start >= line.startsAt && start <= line.endsAt);
    const line = lines[index];
    const parts = splitQuotePrefix(line.text);
    const column = start - line.startsAt;

    if (parts.depth === 0 || column < parts.quote.length) {
        return null;
    }

    const prev = index > 0 ? lines[index - 1] : null;
    return { line, column, parts, prev, prevParts: prev ? splitQuotePrefix(prev.text) : null };
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

/**
 * Enter on a quoted line:
 * - continues the quote at the same depth, and a list inside it
 * - on an empty list item leaves the list but stays in the quote
 * - on an empty quote line after text makes a paragraph break (`>` line)
 * - on an empty quote line after a paragraph break leaves one quote level
 * - on an empty quote line that starts the quote removes the markers
 */
export const quoteEnter = (value: string, start: number, end: number): QuoteEdit | null => {
    const at = quotedLineAt(value, start, end);
    if (!at) {
        return null;
    }

    const { line, parts, prev, prevParts } = at;
    const { quote, rest, depth } = parts;
    const cont = quoteContinuation(quote);
    const outer = quoteOuter(quote);

    if (isInsideFencedCodeBlock(value, start)) {
        return { from: start, to: end, text: `\n${cont}${M}` };
    }

    if (rest.trim() === '') {
        if (!prev || prevParts!.depth < depth) {
            // the quote starts on this line: leave it
            return { from: line.startsAt, to: line.endsAt, text: quotePrefix(outer, true) + M };
        }

        if (prevParts!.depth === depth && prevParts!.rest.trim() === '') {
            // second empty line in a row: leave one quote level, keeping a blank line between
            return {
                from: prev.startsAt,
                to: line.endsAt,
                text: `${quoteBlank(outer)}\n${quotePrefix(outer, true)}${M}`,
            };
        }

        // first empty line: paragraph break inside the quote
        return { from: line.startsAt, to: line.endsAt, text: `${quoteBlank(quote)}\n${cont}${M}` };
    }

    const item = LIST_ITEM_RE.exec(rest);
    if (item) {
        const [, indent, marker, , content] = item;
        const textAfterCaret = line.text.slice(at.column);

        if (content.trim() === '' && textAfterCaret.trim() === '') {
            // empty list item: leave the list, stay in the quote
            return { from: line.startsAt, to: line.endsAt, text: cont + M };
        }

        return { from: start, to: end, text: `\n${cont}${indent}${nextListMarker(marker)} ${M}` };
    }

    return { from: start, to: end, text: `\n${cont}${M}` };
};

/**
 * Backspace with the caret right after the quote markers:
 * - on an empty quoted line removes the line
 * - after a paragraph break (`>` line) removes the break
 * - after a quoted line with text joins both lines with a space
 * - on the first line of a quote removes one quote level
 */
export const quoteBackspace = (value: string, start: number, end: number): QuoteEdit | null => {
    const at = quotedLineAt(value, start, end);
    if (!at || at.column !== at.parts.quote.length) {
        return null;
    }

    const { line, parts, prev, prevParts } = at;
    const { quote, rest, depth } = parts;
    const contentStart = line.startsAt + quote.length;

    if (prev && prevParts!.depth === depth) {
        if (rest.trim() === '') {
            return { from: prev.endsAt, to: line.endsAt, text: M };
        }

        if (prevParts!.rest.trim() === '') {
            return { from: prev.startsAt, to: contentStart, text: quote + M };
        }

        const separator = /\s$/.test(prev.text) ? '' : ' ';
        return { from: prev.endsAt, to: contentStart, text: separator + M };
    }

    return { from: line.startsAt, to: contentStart, text: quotePrefix(quoteOuter(quote), rest !== '') + M };
};

/**
 * Paste of several lines into a quote: every pasted line gets the quote markers,
 * blank lines become paragraph breaks (`>` lines)
 */
export const quotePaste = (value: string, start: number, end: number, clipboard: string): QuoteEdit | null => {
    const pasted = clipboard.replace(/\r\n?/g, '\n');
    if (!pasted.includes('\n')) {
        return null;
    }

    const lines = splitLines(value);
    const line = lines.find((l) => start >= l.startsAt && start <= l.endsAt)!;
    const { quote, depth } = splitQuotePrefix(line.text);

    if (depth === 0 || start - line.startsAt < quote.length) {
        return null;
    }

    const pastedLines = pasted.split('\n');
    const text = pastedLines
        .map((l, index) => {
            if (index === 0) {
                return l;
            }
            // the last line continues with the text after the caret, so it keeps the full markers
            const isLast = index === pastedLines.length - 1;
            return quotePrefix(quote, l.trim() !== '' || isLast) + l;
        })
        .join('\n');

    return { from: start, to: end, text: text + M };
};
