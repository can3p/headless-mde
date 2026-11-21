import { getIncrementedOrderedListPrefix, quoteContinuation, splitQuotePrefix, takeQuoteLevels } from './utils';

/** A list marker with the text that follows it, every part as written in the line */
export type ListMarker = {
    /** `-`, `*`, `+`, `1.`, `1.1.`, `1)` */
    marker: string;
    /** Whitespace after the marker */
    spacing: string;
    /** A task checkbox with the whitespace after it, e.g. `[ ] ` */
    checkbox?: string;
};

/** The markup at the start of a line. Concatenated, `quote + indent + list parts + content` is the line. */
export type LinePrefix = {
    /** Blockquote markers as written, e.g. `> > ` */
    quote: string;
    /** Quote nesting level */
    depth: number;
    /** Whitespace before the list marker, or before the content when there is no list */
    indent: string;
    list: ListMarker | null;
    content: string;
};

const LIST_ITEM_RE = /^(\s*)([-*+]|\d+(?:\.\d+)?[.)])(\s+)(\[[ xX]\](?:\s+|$))?/;

/**
 * Splits a line into its markup and content.
 * `quoteLevels` limits how many quote levels count: inside a fenced code block that lives in a quote,
 * pass the fence depth (`openFenceAt`), the rest of the line is code.
 */
export const parseLinePrefix = (text: string, quoteLevels?: number): LinePrefix => {
    const { quote, rest, depth } = quoteLevels === undefined ? splitQuotePrefix(text) : takeQuoteLevels(text, quoteLevels);
    const item = LIST_ITEM_RE.exec(rest);

    if (!item) {
        const indent = /^\s*/.exec(rest)![0];
        return { quote, depth, indent, list: null, content: rest.slice(indent.length) };
    }

    const [match, indent, marker, spacing, checkbox] = item;
    return {
        quote,
        depth,
        indent,
        list: checkbox === undefined ? { marker, spacing } : { marker, spacing, checkbox },
        content: rest.slice(match.length),
    };
};

/** Length of the markup in front of the content, as written in the line */
export const prefixLength = ({ quote, indent, list }: LinePrefix) =>
    quote.length + indent.length + (list ? list.marker.length + list.spacing.length + (list.checkbox?.length ?? 0) : 0);

/** Markup for a new line with content: quote markers in their continuation form, then indent and list parts */
export const formatLinePrefix = ({ quote, indent, list }: LinePrefix) =>
    quoteContinuation(quote) + indent + (list ? list.marker + list.spacing + (list.checkbox ?? '') : '');

/** The marker of the next list item: `-` stays `-`, `1.` becomes `2.`, `1.1)` becomes `1.2)` */
export const nextListMarker = (marker: string) => {
    if (/^[-*+]$/.test(marker)) {
        return marker;
    }
    const next = getIncrementedOrderedListPrefix(marker.replace(/\)$/, ''));
    return marker.endsWith(')') ? next.replace(/\.$/, ')') : next;
};

/** The markup of the item after `prefix`: same quote and indent, next marker, an unchecked checkbox */
export const continuationPrefix = (prefix: LinePrefix): LinePrefix => ({
    ...prefix,
    content: '',
    list: prefix.list && {
        marker: nextListMarker(prefix.list.marker),
        spacing: ' ',
        ...(prefix.list.checkbox !== undefined && { checkbox: '[ ] ' }),
    },
});

// eg: 1)content | 1) content | 1.1)content | 1.)content
const PARENTHESIS_MARKER_RE = /^(\s*)(\d+(?:\.\d+)?)\.?\)\s*/;

/**
 * Auto-correct for a `1)` ordered list marker at the start of `text` (a line without its quote markers):
 * the `length` characters at the start become `text`, e.g. `1)x` → `1. x`. `null` without such a marker.
 */
export const correctListMarker = (text: string): { length: number; text: string } | null => {
    const match = PARENTHESIS_MARKER_RE.exec(text);
    return match && { length: match[0].length, text: `${match[1]}${match[2]}. ` };
};
