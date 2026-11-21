import { Cursor, Line } from './Cursor';
import { CaretContext, caretContext, TextEdit } from './caretContext';
import { OpenFence, quoteBlank, quoteContinuation, quoteOuter, quotePrefix } from './utils';

const M = Cursor.MARKER;

/** A quoted line split at its quote markers, every part as written */
type QuotedLine = {
    line: Line;
    /** Quote markers, e.g. `> > ` */
    quote: string;
    depth: number;
    /** Everything after the quote markers */
    rest: string;
};

type QuotedCaret = QuotedLine & {
    /** Caret offset inside the line */
    column: number;
    /** The line above, `null` on the first line */
    prev: QuotedLine | null;
    /** Caret is inside a fenced code block that lives in this quote */
    inCode: boolean;
};

const quotedLine = ({ line, prefix }: { line: Line; prefix: CaretContext['prefix'] }): QuotedLine => ({
    line,
    quote: prefix.quote,
    depth: prefix.depth,
    rest: line.text.slice(prefix.quote.length),
});

/**
 * Describes a collapsed caret placed after the quote markers of a quoted line, `null` otherwise.
 * Inside a code block only the markers of the quote holding the block count, the rest is code:
 * in a code block outside any quote there are no markers at all.
 */
const quotedCaretAt = (context: CaretContext): QuotedCaret | null => {
    const { start, end, prefix, column, prev, fence } = context;
    if (start !== end || prefix.depth === 0 || column < prefix.quote.length) {
        return null;
    }
    return { ...quotedLine(context), column, prev: prev && quotedLine(prev), inCode: fence !== null };
};

/** Enter on a quoted line without content */
const enterOnEmptyQuoteLine = ({ line, quote, depth, prev }: QuotedCaret): TextEdit => {
    const outer = quoteOuter(quote);

    if (!prev || prev.depth < depth) {
        // the quote starts on this line: leave it
        return { from: line.startsAt, to: line.endsAt, text: quotePrefix(outer, true) + M };
    }

    if (prev.depth === depth && prev.rest.trim() === '') {
        // second empty line in a row: leave one quote level, keeping a blank line between
        return {
            from: prev.line.startsAt,
            to: line.endsAt,
            text: `${quoteBlank(outer)}\n${quotePrefix(outer, true)}${M}`,
        };
    }

    // first empty line: paragraph break inside the quote
    return { from: line.startsAt, to: line.endsAt, text: `${quoteBlank(quote)}\n${quoteContinuation(quote)}${M}` };
};

/**
 * Enter on a quoted line (lists inside quotes are the list rule's, see `enter.ts`):
 * - continues the quote at the same depth
 * - on an empty quote line after text makes a paragraph break (`>` line)
 * - on an empty quote line after a paragraph break leaves one quote level
 * - on an empty quote line that starts the quote removes the markers
 * - inside a code block in the quote only continues the quote
 * A selection keeps the plain behavior.
 */
export const quoteEnterRule = (context: CaretContext): TextEdit | null => {
    const caret = quotedCaretAt(context);
    if (!caret) {
        return null;
    }

    const continueQuote = { from: context.start, to: context.end, text: `\n${quoteContinuation(caret.quote)}${M}` };

    if (caret.inCode) {
        return continueQuote;
    }
    if (caret.rest.trim() === '') {
        return enterOnEmptyQuoteLine(caret);
    }
    return continueQuote;
};

/** `quoteEnterRule` for a value and selection; text is LF-only, as a textarea gives it */
export const quoteEnter = (value: string, start: number, end: number, fence?: OpenFence | null): TextEdit | null =>
    quoteEnterRule(caretContext(value, start, end, fence));

/**
 * Backspace with the caret right after the quote markers:
 * - on an empty quoted line removes the line
 * - after a paragraph break (`>` line) removes the break
 * - after a quoted line with text joins both lines with a space
 * - on the first line of a quote, or below a shallower quote, removes one quote level
 * Inside a code block, and with a selection, it keeps the plain behavior.
 */
export const quoteBackspaceRule = (context: CaretContext): TextEdit | null => {
    const caret = quotedCaretAt(context);
    if (!caret || caret.inCode || caret.column !== caret.quote.length) {
        return null;
    }

    const { line, quote, depth, rest, prev } = caret;
    const contentStart = line.startsAt + quote.length;

    // a deeper line above counts too: in markdown this line already continues that paragraph
    if (prev && prev.depth >= depth) {
        if (rest.trim() === '') {
            return { from: prev.line.endsAt, to: line.endsAt, text: M };
        }

        if (prev.rest.trim() === '') {
            return { from: prev.line.startsAt, to: contentStart, text: quote + M };
        }

        const separator = /\s$/.test(prev.line.text) ? '' : ' ';
        return { from: prev.line.endsAt, to: contentStart, text: separator + M };
    }

    return {
        from: line.startsAt,
        to: contentStart,
        text: quotePrefix(quoteOuter(quote), rest !== '') + M,
    };
};

/** `quoteBackspaceRule` for a value and selection; text is LF-only, as a textarea gives it */
export const quoteBackspace = (value: string, start: number, end: number): TextEdit | null =>
    quoteBackspaceRule(caretContext(value, start, end));

/**
 * Paste of several lines into a quote: every pasted line gets the quote markers,
 * blank lines become paragraph breaks (`>` lines). Inside a code block in the quote
 * lines get the markers as they are. `value` is LF-only, as a textarea gives it; the clipboard may have CRLF.
 */
export const quotePaste = (value: string, start: number, end: number, clipboard: string): TextEdit | null => {
    const pasted = clipboard.replace(/\r\n?/g, '\n');
    if (!pasted.includes('\n')) {
        return null;
    }

    // the caret may sit on a selection: describe its start
    const caret = quotedCaretAt(caretContext(value, start, start));
    if (!caret) {
        return null;
    }

    const { quote } = caret;
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
