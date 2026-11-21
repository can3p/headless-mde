import { CommandHandler } from './types';
import { clamp, mapQuotedContent, quoteContinuation, quoteOuter, quotePrefix, splitQuotePrefix } from './utils';
import { Cursor } from './Cursor';
import { LinePrefix, parseLinePrefix } from './linePrefix';

export const boldCommandHandler: CommandHandler = ({ cursor, options: { preferredBoldSyntax, boldPlaceholder } }) => {
    cursor.wrap(preferredBoldSyntax, { placeholder: boldPlaceholder });
};

export const italicCommandHandler: CommandHandler = ({
    cursor,
    options: { preferredItalicSyntax, italicPlaceholder },
}) => {
    cursor.wrap(preferredItalicSyntax, { placeholder: italicPlaceholder });
};

export const linkCommandHandler: CommandHandler = ({ options, cursor }) => {
    const { linkTextPlaceholder, linkUrlPlaceholder } = options;

    const linkText = cursor.selection?.text || linkTextPlaceholder;
    const linkUrl = linkUrlPlaceholder;
    cursor.insert(`[${linkText}](${Cursor.MARKER}${linkUrl}${Cursor.MARKER})`);
};

export const imageCommandHandler: CommandHandler = ({ options, cursor }) => {
    const { imageTextPlaceholder, imageUrlPlaceholder } = options;

    const imageText = cursor.selection?.text || imageTextPlaceholder;
    const imageUrl = imageUrlPlaceholder;

    cursor.insert(`![${imageText}](${Cursor.MARKER}${imageUrl}${Cursor.MARKER})`);
};

/** The line without its list marker, everything else as written */
const withoutListMarker = ({ quote, indent, list, content }: LinePrefix) => quote + indent + (list?.checkbox ?? '') + content;

/**
 * Toggles a list on the current lines: removes the markers when `isItem` holds for every line, otherwise
 * puts `marker(index)` in front of each line's content, after the blockquote markers
 */
const toggleList = (cursor: Cursor, isItem: (prefix: LinePrefix) => boolean, marker: (index: number) => string) => {
    const lines = cursor.selection?.lines ?? [cursor.position.line];
    const needUndo = lines.every((line) => isItem(parseLinePrefix(line.text)));

    cursor.replaceCurrentLines(
        (line, index) =>
            needUndo
                ? withoutListMarker(parseLinePrefix(line.text))
                : mapQuotedContent(line.text, (content) => `${marker(index)} ${content}`),
        { selectReplaced: Boolean(cursor.selection) },
    );
};

export const orderedListCommandHandler: CommandHandler = ({ cursor }) => {
    toggleList(cursor, ({ list }) => list !== null && /^\d/.test(list.marker), (index) => `${index + 1}.`);
};

export const unorderedListCommandHandler: CommandHandler = ({ cursor, options }) => {
    const syntax = options.preferredUnorderedListSyntax;
    // an indented item is a nested list: the command adds a list around it instead
    toggleList(cursor, ({ list, indent }) => list?.marker === syntax && indent === '', () => syntax);
};

export const codeBlockCommandHandler: CommandHandler = ({ cursor, options: { codeBlockPlaceholder } }) => {
    const lines = cursor.selection?.lines ?? [cursor.position.line];
    const { quote } = splitQuotePrefix(lines[0].text);

    if (!quote) {
        cursor.wrap(['```\n', '\n```'], { placeholder: codeBlockPlaceholder });
        return;
    }

    // Inside a blockquote the fences must carry the quote markers too, so the block wraps whole lines
    const M = Cursor.MARKER;
    const first = lines[0];
    const last = lines[lines.length - 1];
    const content = cursor.value.slice(first.startsAt + quote.length, last.endsAt);
    const body =
        content.trim() === ''
            ? `${quoteContinuation(quote)}${M}${codeBlockPlaceholder}${M}`
            : `${quote}${M}${content}${M}`;
    const fence = quoteContinuation(quote) + '```';

    cursor.replaceRange(first.startsAt, last.endsAt, `${fence}\n${body}\n${fence}`);
};

export const codeInlineCommandHandler: CommandHandler = ({ cursor, options: { codeInlinePlaceholder } }) => {
    cursor.wrap('`', { placeholder: codeInlinePlaceholder });
};

export const codeCommandHandler: CommandHandler = (ctx) => {
    const selectedLines = ctx.cursor.selection?.lines ?? [];
    if (selectedLines.length > 1) {
        codeBlockCommandHandler(ctx);
    } else {
        codeInlineCommandHandler(ctx);
    }
};

/** A selection of whole lines ends at the start of the next line: that line is not part of it */
const excludeLineAfterSelection = (cursor: Cursor) => {
    const selection = cursor.selection;
    const lastLine = selection?.lines[selection.lines.length - 1];
    if (selection && lastLine && selection.lines.length > 1 && selection.selectionEnd === lastLine.startsAt) {
        cursor.select({ start: selection.selectionStart, end: selection.selectionEnd - 1 });
    }
};

/** Quote markers and content of a line after adding a quote level, a blank line gets a bare `>` */
const quoteLine = (text: string) => ({ prefix: text.trim() === '' ? '>' : '> ', content: text.trim() === '' ? '' : text });

/** Quote markers and content of a line after removing one quote level */
const unquoteLine = (text: string) => {
    const { quote, rest } = splitQuotePrefix(text);
    return { prefix: quotePrefix(quoteOuter(quote), rest !== ''), content: rest };
};

/**
 * Toggles a blockquote on whole lines: quotes every selected line, or removes one level
 * when every selected line with text is already quoted
 */
export const blockQuotesCommandHandler: CommandHandler = ({ cursor, options }) => {
    excludeLineAfterSelection(cursor);

    const selection = cursor.selection;
    const lines = selection?.lines ?? [cursor.position.line];
    const withText = lines.filter((line) => line.text.trim() !== '');

    if (withText.length === 0 && !selection) {
        const placeholder = `> ${Cursor.MARKER}${options.blockQuotesPlaceholder}${Cursor.MARKER}`;
        cursor.replaceLine(cursor.position.line.lineNumber, placeholder);
        return;
    }

    const unquote = withText.length > 0 && withText.every((line) => splitQuotePrefix(line.text).depth > 0);
    const toggle = unquote ? unquoteLine : quoteLine;

    if (selection) {
        cursor.replaceCurrentLines(
            (line) => {
                const { prefix, content } = toggle(line.text);
                return prefix + content;
            },
            { selectReplaced: true },
        );
        return;
    }

    // no selection: toggle the current line and keep the caret on the same character of the content
    const line = cursor.position.line;
    const { prefix, content } = toggle(line.text);
    const oldPrefixLength = line.text.length - content.length;
    const column = Math.max(0, cursor.position.cursorAt - line.startsAt - oldPrefixLength);

    cursor.replaceRange(line.startsAt, line.endsAt, prefix + content.slice(0, column) + Cursor.MARKER + content.slice(column));
};

export const strikeThroughCommandHandler: CommandHandler = ({ cursor, options: { strikeThroughPlaceholder } }) => {
    cursor.wrap('~~', { placeholder: strikeThroughPlaceholder });
};

export const createHeadlineCommandHandler =
    (level: number): CommandHandler =>
    ({ cursor, options }) => {
        const prefix = '#'.repeat(clamp(level, 1, 6)) + ' ';
        const { headlinePlaceholder } = options;
        const placeholder = headlinePlaceholder instanceof Function ? headlinePlaceholder(level) : headlinePlaceholder;
        const currentLine = cursor.position.line;
        // the headline markup goes after the blockquote markers
        const { quote, rest } = splitQuotePrefix(currentLine.text);
        const needUndo = rest.slice(0, level + 1) === prefix;
        const content = rest.replace(/^#{0,6}\s+/, '') || placeholder;

        cursor.replaceLine(
            currentLine.lineNumber,
            `${quote}${needUndo ? '' : prefix}${Cursor.MARKER}${content}${Cursor.MARKER}`,
        );
    };
