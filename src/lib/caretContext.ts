import type { Line } from './Cursor';
import { LinePrefix, parseLinePrefix } from './linePrefix';
import type { TextareaMarkdownOptions } from './types';
import { getLines, OpenFence, openFenceAt } from './utils';

/**
 * A replacement of `value.slice(from, to)` with `text`.
 * `text` carries a `Cursor.MARKER` where the caret goes.
 */
export type TextEdit = {
    from: number;
    to: number;
    text: string;
};

/** What every key rule gets to know about the caret. Built once per key event by `caretContext`. */
export type CaretContext = {
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
    /** The line above with its markup (every quote level, even when `line` is in a code block), `null` on the first line */
    prev: { line: Line; prefix: LinePrefix } | null;
};

/** One key behavior: the edit to make, `null` when the rule doesn't apply */
export type EditRule = (context: CaretContext) => TextEdit | null;

/**
 * Describes the selection `start`–`end` of `value`, LF-only text as a textarea gives it.
 * The text is split into lines once, here.
 */
export const caretContext = (
    value: string,
    start: number,
    end: number,
    fence: OpenFence | null = openFenceAt(value, start),
): CaretContext => {
    const lines = getLines(value);
    const index = lines.findIndex((l) => start >= l.startsAt && start <= l.endsAt);
    const line = lines[index];
    const prevLine = index > 0 ? lines[index - 1] : null;
    return {
        value,
        start,
        end,
        line,
        column: start - line.startsAt,
        fence,
        prefix: parseLinePrefix(line.text, fence?.depth),
        prev: prevLine && { line: prevLine, prefix: parseLinePrefix(prevLine.text) },
    };
};

/** The edit of the first rule that applies */
export const firstEdit = (context: CaretContext, rules: EditRule[]): TextEdit | null => {
    for (const rule of rules) {
        const edit = rule(context);
        if (edit) {
            return edit;
        }
    }
    return null;
};

/** `rule`, limited to quoted lines */
export const quotedOnly =
    (rule: EditRule): EditRule =>
    (context) =>
        context.prefix.depth > 0 ? rule(context) : null;

/**
 * Which lists the list rules (Enter and Backspace) take: every list with prefix wrapping, only lists in a
 * quote with just the blockquote extension, `null` with neither.
 */
export const listScope = (options: TextareaMarkdownOptions): ((rule: EditRule) => EditRule) | null => {
    if (options.enablePrefixWrappingExtension) {
        return (rule) => rule;
    }
    return options.enableBlockquoteExtension ? quotedOnly : null;
};

export const applyTextEdit = (value: string, { from, to, text }: TextEdit) =>
    value.slice(0, from) + text + value.slice(to);
