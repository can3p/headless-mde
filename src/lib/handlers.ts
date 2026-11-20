import { CommandHandler } from './types';
import { clamp, escapeRegExp, quoteContinuation, quoteOuter, quotePrefix, splitQuotePrefix } from './utils';
import { Cursor } from './Cursor';

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

export const orderedListCommandHandler: CommandHandler = ({ cursor }) => {
    const re = /(\d+\.){1,2}\s+/;
    const lines = cursor.selection?.lines ?? [cursor.position.line];
    const needUndo = lines.every((line) => re.test(splitQuotePrefix(line.text).rest));

    // list markers go after the blockquote markers
    cursor.replaceCurrentLines(
        (line, index) => {
            const { quote, rest } = splitQuotePrefix(line.text);
            return quote + (needUndo ? rest.replace(re, '') : `${index + 1}. ${rest}`);
        },
        {
            selectReplaced: Boolean(cursor.selection),
        },
    );
};

export const unorderedListCommandHandler: CommandHandler = ({ cursor, options }) => {
    const syntax = options.preferredUnorderedListSyntax;
    const re = new RegExp(`^${escapeRegExp(syntax)}\\s+`);
    const lines = cursor.selection?.lines ?? [cursor.position.line];
    const needUndo = lines.every((line) => re.test(splitQuotePrefix(line.text).rest));

    // list markers go after the blockquote markers
    cursor.replaceCurrentLines(
        (line) => {
            const { quote, rest } = splitQuotePrefix(line.text);
            return quote + (needUndo ? rest.replace(re, '') : `${syntax} ${rest}`);
        },
        {
            selectReplaced: Boolean(cursor.selection),
        },
    );
};

export const codeBlockCommandHandler: CommandHandler = ({ cursor, options: { codeBlockPlaceholder } }) => {
    const lines = cursor.selection?.lines ?? [cursor.position.line];
    const { quote } = splitQuotePrefix(lines[0].text);

    if (!quote) {
        cursor.wrap(['```\n', '\n```'], { placeholder: codeBlockPlaceholder });
        return;
    }

    // Inside a blockquote the fences must carry the quote markers too, so the block wraps whole lines
    const fence = quoteContinuation(quote) + '```';
    const isEmpty = lines.length === 1 && splitQuotePrefix(lines[0].text).rest.trim() === '';

    const M = Cursor.MARKER;

    cursor.replaceCurrentLines((line, index, all) => {
        const isFirst = index === 0;
        const isLast = index === all.length - 1;
        const { quote: lineQuote, rest } = splitQuotePrefix(line.text);
        const body = isEmpty
            ? `${quoteContinuation(quote)}${M}${codeBlockPlaceholder}${M}`
            : lineQuote + (isFirst ? M : '') + rest + (isLast ? M : '');

        return (isFirst ? `${fence}\n` : '') + body + (isLast ? `\n${fence}` : '');
    });
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

/**
 * Toggles a blockquote on whole lines: quotes every selected line, or removes one level
 * when every selected line with text is already quoted
 */
export const blockQuotesCommandHandler: CommandHandler = ({ cursor, options }) => {
    let selection = cursor.selection;

    // a selection of whole lines ends at the start of the next line, that line is not part of it
    const lastLine = selection?.lines[selection.lines.length - 1];
    if (selection && lastLine && selection.lines.length > 1 && selection.selectionEnd === lastLine.startsAt) {
        cursor.select({ start: selection.selectionStart, end: selection.selectionEnd - 1 });
        selection = cursor.selection;
    }
    const lines = selection?.lines ?? [cursor.position.line];
    const withText = lines.filter((line) => line.text.trim() !== '');

    if (!selection && withText.length === 0) {
        const lineNumber = cursor.position.line.lineNumber;
        cursor.replaceLine(lineNumber, `> ${Cursor.MARKER}${options.blockQuotesPlaceholder}${Cursor.MARKER}`);
        return;
    }

    const unquote = withText.length > 0 && withText.every((line) => splitQuotePrefix(line.text).depth > 0);

    const toggle = (text: string) => {
        if (unquote) {
            const { quote, rest } = splitQuotePrefix(text);
            return { prefix: quotePrefix(quoteOuter(quote), rest !== ''), quote, rest };
        }
        // a blank line becomes a bare `>`, so the quote stays one block with its paragraph breaks
        return { prefix: text.trim() === '' ? '>' : '> ', quote: '', rest: text.trim() === '' ? '' : text };
    };

    if (selection) {
        cursor.replaceCurrentLines(
            (line) => {
                const { prefix, rest } = toggle(line.text);
                return prefix + rest;
            },
            { selectReplaced: true },
        );
        return;
    }

    // no selection: toggle the current line and keep the caret on the same character
    const line = cursor.position.line;
    const column = cursor.position.cursorAt - line.startsAt;
    const { prefix, quote, rest } = toggle(line.text);
    const restColumn = Math.max(0, column - quote.length);
    cursor.replaceRange(
        line.startsAt,
        line.endsAt,
        prefix + rest.slice(0, restColumn) + Cursor.MARKER + rest.slice(restColumn),
    );
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
