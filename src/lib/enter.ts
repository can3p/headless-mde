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
        if (fence || !prefix.list || (scope === 'quoted' && prefix.depth === 0) || column < prefixLength(prefix)) {
            return null;
        }
        if (prefix.content.trim() === '') {
            return leaveItem(line, prefix.quote);
        }
        return { from: start, to: end, text: `\n${formatLinePrefix(continuationPrefix(prefix))}${M}` };
    };

const toConfig = (value: PrefixWrappingConfig | string): PrefixWrappingConfig =>
    typeof value === 'string' ? { prefix: value } : value;

/**
 * Custom prefixes from `customPrefixWrapping`. A prefix is matched at the start of the line, after any
 * whitespace; on a quoted line also after the quote markers, then the quote carries over too.
 */
export const customPrefixRule = (customs: (PrefixWrappingConfig | string)[]): EnterRule => {
    const configs = customs.map(toConfig);

    return ({ line, column, start, end, fence, prefix }) => {
        if (fence) {
            return null;
        }

        const quotes = prefix.quote ? ['', prefix.quote] : [''];
        for (const config of configs) {
            const text = config.prefix instanceof Function ? config.prefix(line) : config.prefix;
            const pattern = config.prefixPattern ?? new RegExp(escapeRegExp(text));
            const startRe = new RegExp(`^\\s*(?:${pattern.source})`);

            for (const quote of quotes) {
                const body = line.text.slice(quote.length);
                const match = startRe.exec(body);
                if (!match) {
                    continue;
                }
                if (column < quote.length + match[0].length) {
                    return null;
                }
                if (config.shouldBreakIfEmpty !== false && body.replace(pattern, '').trim() === '') {
                    return leaveItem(line, quote);
                }
                const indent = config.shouldSaveIndent === false ? '' : /^\s*/.exec(body)![0];
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
        rules.push(customPrefixRule(options.customPrefixWrapping), listRule('all'));
    } else if (options.enableBlockquoteExtension) {
        rules.push(listRule('quoted'));
    }
    if (options.enableBlockquoteExtension) {
        rules.push(quoteRule);
    }
    return rules;
};

export const applyTextEdit = (value: string, { from, to, text }: TextEdit) => value.slice(0, from) + text + value.slice(to);

/** One edit with the effect of `first`, then `second` applied to the result */
export const composeEdits = (value: string, first: TextEdit, second: TextEdit): TextEdit => {
    const shift = (edit: TextEdit) => edit.text.length - (edit.to - edit.from);
    const from = Math.min(first.from, second.from);
    // the end of the changed range, in the text after `first`
    const to = Math.max(first.from + first.text.length, second.to);
    const result = applyTextEdit(applyTextEdit(value, first), second);
    return { from, to: to - shift(first), text: result.slice(from, to + shift(second)) };
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
    return composeEdits(value, correction, next);
};
