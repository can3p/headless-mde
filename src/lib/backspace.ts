import { Cursor } from './Cursor';
import { quoteBackspaceRule } from './blockquote';
import { CaretContext, EditRule, listScope } from './caretContext';
import { LinePrefix, prefixLength } from './linePrefix';
import { TextareaMarkdownOptions } from './types';

const M = Cursor.MARKER;

/**
 * How the line above relates to a list item at the same quote depth:
 * - `sibling`: an item at least as deep, the one this item continues
 * - `parent`: a shallower item, the one this item is nested in
 * - `none`: no item (the first line, text, a blank line, another quote depth)
 * Indents are compared by length, so spaces only.
 */
const relationToPrev = (
    prefix: LinePrefix,
    prev: CaretContext['prev'],
): { relation: 'sibling' | 'parent'; prev: NonNullable<CaretContext['prev']> } | { relation: 'none' } => {
    if (!prev || !prev.prefix.list || prev.prefix.depth !== prefix.depth) {
        return { relation: 'none' };
    }
    return { relation: prev.prefix.indent.length >= prefix.indent.length ? 'sibling' : 'parent', prev };
};

/**
 * Backspace with the caret right after a list marker, its spacing and checkbox:
 * - below an item of the same list: an empty item is removed, an item with text joins the line above with
 *   a space (none when the line above ends with whitespace)
 * - below the item it is nested in: outdents to that item's indent
 * - otherwise: removes the marker and its indent, so Backspace again follows the quote rules
 * Inside a code block, and with a selection, it keeps the plain behavior.
 */
export const listBackspace: EditRule = ({ start, end, fence, line, column, prefix, prev }) => {
    const { list, quote, content } = prefix;
    if (start !== end || fence || !list || column !== prefixLength(prefix)) {
        return null;
    }
    const contentStart = line.startsAt + column;

    const above = relationToPrev(prefix, prev);
    switch (above.relation) {
        case 'sibling': {
            if (content.trim() === '') {
                return { from: above.prev.line.endsAt, to: line.endsAt, text: M };
            }
            const separator = /\s$/.test(above.prev.line.text) ? '' : ' ';
            return { from: above.prev.line.endsAt, to: contentStart, text: separator + M };
        }
        case 'parent': {
            const markup = list.marker + list.spacing + (list.checkbox ?? '');
            return {
                from: line.startsAt + quote.length,
                to: contentStart,
                text: above.prev.prefix.indent + markup + M,
            };
        }
        case 'none':
            return { from: line.startsAt + quote.length, to: contentStart, text: M };
    }
};

/** The Backspace rules the options turn on, in the order they are tried: a list marker before quote markers */
export const backspaceRules = (options: TextareaMarkdownOptions): EditRule[] => {
    const rules: EditRule[] = [];
    const lists = listScope(options);
    if (lists) {
        rules.push(lists(listBackspace));
    }
    if (options.enableBlockquoteExtension) {
        rules.push(quoteBackspaceRule);
    }
    return rules;
};
