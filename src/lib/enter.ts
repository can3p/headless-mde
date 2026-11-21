import { Cursor, Line } from './Cursor';
import { quoteEnter, TextEdit } from './blockquote';
import { continuationPrefix, correctListMarker, formatLinePrefix, LinePrefix, parseLinePrefix, prefixLength } from './linePrefix';
import { PrefixWrappingConfig, TextareaMarkdownOptions } from './types';
import { escapeRegExp, getLines, OpenFence, openFenceAt, quoteContinuation, splitQuotePrefix } from './utils';

const M = Cursor.MARKER;

/** What every Enter rule gets to know about the caret */
export type EnterContext = {
    value: string;
    start: number;
    end: number;
    /** The line holding `start` */
    line: Line;
    /** Caret offset inside `line` */
    column: number;
    fence: OpenFence | null;
    /** Markup of `line`, inside a code block only the quote levels holding it */
    prefix: LinePrefix;
};

/** One Enter behavior: the edit to make, `null` when the rule doesn't apply */
export type EnterRule = (context: EnterContext) => TextEdit | null;

/** Enter on an empty item: leave the list, but stay in the quote */
const leaveItem = (line: Line, quote: string): TextEdit => ({
    from: line.startsAt,
    to: line.endsAt,
    text: quote ? quoteContinuation(quote) + M : '\n' + M,
});

/**
 * List items continue with the next marker, the same quote and indent and an unchecked checkbox.
 * `quoted` limits the rule to lists inside a quote.
 */
export const listRule =
    (scope: 'all' | 'quoted'): EnterRule =>
    ({ line, column, start, end, fence, prefix }) => {
        const { list, quote, indent, content, depth } = prefix;
        if (fence || !list || (scope === 'quoted' && depth === 0)) {
            return null;
        }
        const empty = content.trim() === '';
        // an empty item ends after its marker, the spacing may be trailing whitespace
        const contentColumn = empty ? quote.length + indent.length + list.marker.length : prefixLength(prefix);
        if (column < contentColumn) {
            return null;
        }
        if (empty) {
            return leaveItem(line, quote);
        }
        return { from: start, to: end, text: `\n${formatLinePrefix(continuationPrefix(prefix))}${M}` };
    };

const toConfig = (value: PrefixWrappingConfig | string): PrefixWrappingConfig =>
    typeof value === 'string' ? { prefix: value } : value;

/**
 * Custom prefixes from `customPrefixWrapping`, matched at the start of the line after any whitespace.
 * On a quoted line they are matched after the quote markers too, and the quote carries over; a function
 * `prefix` then gets the line without its markers. With `quotes` (the blockquote extension) quoted lines
 * are only matched after the markers, so a `'> '` prefix doesn't take over from the quote rule.
 */
export const customPrefixRule = (customs: (PrefixWrappingConfig | string)[], { quotes }: { quotes: boolean }): EnterRule => {
    const configs = customs.map(toConfig);

    return ({ line, column, start, end, fence, prefix }) => {
        if (fence) {
            return null;
        }

        const candidates = prefix.quote === '' || !quotes ? [''] : [];
        if (prefix.quote !== '') {
            candidates.push(prefix.quote);
        }

        for (const quote of candidates) {
            const body: Line = { ...line, text: line.text.slice(quote.length), startsAt: line.startsAt + quote.length };
            for (const config of configs) {
                const text = config.prefix instanceof Function ? config.prefix(body) : config.prefix;
                const pattern = config.prefixPattern ?? new RegExp(escapeRegExp(text));
                const match = new RegExp(`^\\s*(?:${pattern.source})`).exec(body.text);
                if (!match) {
                    continue;
                }
                if (column < quote.length) {
                    return null;
                }
                if (column < quote.length + match[0].length) {
                    // the caret is before the content: a plain line break, no other rule takes the line
                    return { from: start, to: end, text: `\n${quotes ? quoteContinuation(quote) : ''}${M}` };
                }
                if (config.shouldBreakIfEmpty !== false && body.text.replace(pattern, '').trim() === '') {
                    return leaveItem(line, quote);
                }
                const indent = config.shouldSaveIndent === false ? '' : /^\s*/.exec(body.text)![0];
                return { from: start, to: end, text: `\n${quoteContinuation(quote)}${indent}${text}${M}` };
            }
        }
        return null;
    };
};

/** Quote continuation, see `quoteEnter` */
export const quoteRule: EnterRule = ({ value, start, end, fence }) => quoteEnter(value, start, end, fence);

/** The Enter rules the options turn on, in the order they are tried */
export const enterRules = (options: TextareaMarkdownOptions): EnterRule[] => {
    const rules: EnterRule[] = [];
    if (options.enablePrefixWrappingExtension) {
        rules.push(
            customPrefixRule(options.customPrefixWrapping, { quotes: options.enableBlockquoteExtension }),
            listRule('all'),
        );
    } else if (options.enableBlockquoteExtension) {
        rules.push(listRule('quoted'));
    }
    if (options.enableBlockquoteExtension) {
        rules.push(quoteRule);
    }
    return rules;
};

export const applyTextEdit = (value: string, { from, to, text }: TextEdit) => value.slice(0, from) + text + value.slice(to);

/** The edit that turns `before` into `after`: everything between their common start and common end */
export const diffEdit = (before: string, after: string): TextEdit => {
    let from = 0;
    while (from < before.length && from < after.length && before[from] === after[from]) {
        from++;
    }
    let tail = 0;
    while (
        tail < before.length - from &&
        tail < after.length - from &&
        before[before.length - 1 - tail] === after[after.length - 1 - tail]
    ) {
        tail++;
    }
    return { from, to: before.length - tail, text: after.slice(from, after.length - tail) };
};

const runRules = (value: string, start: number, end: number, fence: OpenFence | null, rules: EnterRule[]) => {
    const line = getLines(value).find((l) => start >= l.startsAt && start <= l.endsAt)!;
    const context: EnterContext = {
        value,
        start,
        end,
        line,
        column: start - line.startsAt,
        fence,
        prefix: parseLinePrefix(line.text, fence?.depth),
    };
    for (const rule of rules) {
        const edit = rule(context);
        if (edit) {
            return edit;
        }
    }
    return null;
};

/** Rewrites a `1)` list marker on the line at `cursorAt` to `1.`, `null` when there is none */
const markerCorrectionAt = (value: string, cursorAt: number): TextEdit | null => {
    const line = getLines(value).find((l) => cursorAt >= l.startsAt && cursorAt <= l.endsAt)!;
    const { quote, rest } = splitQuotePrefix(line.text);
    const corrected = correctListMarker(rest);
    if (!corrected) {
        return null;
    }
    const from = line.startsAt + quote.length;
    return { from, to: from + corrected.length, text: corrected.text };
};

/**
 * The edit for a plain Enter, `null` to leave it to the textarea.
 * With `autoCorrect`, a `1)` marker becomes `1.` first, in the same edit, so it is one undo step.
 */
export const enterEdit = (
    value: string,
    start: number,
    end: number,
    rules: EnterRule[],
    autoCorrect: boolean,
): TextEdit | null => {
    const fence = openFenceAt(value, start);
    const correction = autoCorrect && !fence ? markerCorrectionAt(value, start) : null;
    if (!correction) {
        return runRules(value, start, end, fence, rules);
    }

    // positions after the correction; a caret inside the old marker goes after the new one
    const corrected = applyTextEdit(value, correction);
    const correctedEnd = correction.from + correction.text.length;
    const map = (position: number) =>
        position <= correction.from
            ? position
            : position < correction.to
              ? correctedEnd
              : position + correctedEnd - correction.to;
    const [newStart, newEnd] = [map(start), map(end)];

    const next = runRules(corrected, newStart, newEnd, fence, rules) ?? { from: newStart, to: newEnd, text: '\n' + M };
    // one edit for both, so the correction and the new line are one undo step
    return diffEdit(value, applyTextEdit(corrected, next));
};
