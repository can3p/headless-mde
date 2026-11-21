import React, { FC, useEffect, useRef, useState } from 'react';
import TextareaMarkdown, { CommandType, TextareaMarkdownOptions, TextareaMarkdownRef } from '../lib';
import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { quoteBackspace, quoteEnter, quotePaste } from '../lib/blockquote';
import { isInsideFencedCodeBlock, splitQuotePrefix } from '../lib/utils';
import { parseContent } from './notation';

type TestCase = {
    description: string;
    input: string;
    expected: string;
    commandName?: CommandType;
    act?: () => Promise<void> | void;
    options?: Partial<TextareaMarkdownOptions>;
};

const enter = () => userEvent.keyboard('{Enter}');
const backspace = () => userEvent.keyboard('{Backspace}');

const run = (cases: TestCase[]) => {
    cases.forEach((c) => {
        test(c.description, async () => {
            const Example: FC = () => {
                const inputData = parseContent(c.input);
                const ref = useRef<TextareaMarkdownRef>(null);
                const [value, setValue] = useState(inputData.text);

                useEffect(() => {
                    ref.current?.setSelectionRange(inputData.selectionStart, inputData.selectionEnd);
                    // eslint-disable-next-line react-hooks/exhaustive-deps
                }, []);

                return (
                    <TextareaMarkdown
                        options={{ enableBlockquoteExtension: true, ...c.options }}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        ref={ref}
                    />
                );
            };

            const view = render(<Example />);
            const textarea = view.container.querySelector('textarea')!;
            textarea.focus();

            // like a toolbar click: outside React's render and effects
            if (c.commandName) {
                await act(async () => (textarea as TextareaMarkdownRef).trigger(c.commandName!));
            }

            await act(async () => {
                await c.act?.();
            });

            const { selectionEnd, selectionStart, text } = parseContent(c.expected);
            expect(textarea.value).toBe(text);
            expect(textarea.selectionStart).toBe(selectionStart);
            expect(textarea.selectionEnd).toBe(selectionEnd);
        });
    });
};

describe('blockquote extension: enter', () => {
    run([
        {
            description: 'continues the quote',
            input: '&gt text<>',
            act: enter,
            expected: '&gt text\n&gt <>',
        },
        {
            description: 'splits a quoted line in the middle',
            input: '&gt some <>text',
            act: enter,
            expected: '&gt some \n&gt <>text',
        },
        {
            description: 'keeps the nesting depth',
            input: '&gt&gt text<>',
            act: enter,
            expected: '&gt&gt text\n&gt&gt <>',
        },
        {
            description: 'keeps the spelling of nested markers',
            input: '&gt &gt text<>',
            act: enter,
            expected: '&gt &gt text\n&gt &gt <>',
        },
        {
            description: 'makes a paragraph break on an empty quote line',
            input: '&gt text\n&gt <>',
            act: enter,
            expected: '&gt text\n&gt\n&gt <>',
        },
        {
            description: 'leaves the quote on a second empty line',
            input: '&gt text\n&gt\n&gt <>',
            act: enter,
            expected: '&gt text\n\n<>',
        },
        {
            description: 'leaves one nesting level on a second empty line',
            input: '&gt &gt text\n&gt &gt\n&gt &gt <>',
            act: enter,
            expected: '&gt &gt text\n&gt\n&gt <>',
        },
        {
            description: 'leaves the quote when the quote starts on the empty line',
            input: 'text\n\n&gt <>',
            act: enter,
            expected: 'text\n\n<>',
        },
        {
            description: 'continues an unordered list inside the quote',
            input: '&gt - item<>',
            act: enter,
            expected: '&gt - item\n&gt - <>',
        },
        {
            description: 'continues an indented list inside the quote',
            input: '&gt - item\n&gt     * nested<>',
            act: enter,
            expected: '&gt - item\n&gt     * nested\n&gt     * <>',
        },
        {
            description: 'continues an ordered list inside the quote',
            input: '&gt 1. item<>',
            act: enter,
            expected: '&gt 1. item\n&gt 2. <>',
        },
        {
            description: 'continues an ordered list with parenthesis inside the quote',
            input: '&gt 1) item<>',
            act: enter,
            expected: '&gt 1) item\n&gt 2) <>',
        },
        {
            description: 'leaves the list but stays in the quote on an empty item',
            input: '&gt - item\n&gt - <>',
            act: enter,
            expected: '&gt - item\n&gt <>',
        },
        {
            description: 'only continues the quote inside a quoted code block',
            input: '&gt ```\n&gt - code<>',
            act: enter,
            expected: '&gt ```\n&gt - code\n&gt <>',
        },
        {
            description: 'moves the list marker with the text when the caret is before it',
            input: '&gt <>- item',
            act: enter,
            expected: '&gt \n&gt <>- item',
        },
        {
            description: 'does not quote code lines inside a code block outside a quote',
            input: '```\n&gt code<>',
            act: enter,
            expected: '```\n&gt code\n<>',
        },
        {
            description: 'auto-corrects an ordered list inside a quote before continuing it',
            input: '&gt 1)item<>',
            act: enter,
            options: { enableOrderedListAutoCorrectExtension: true },
            expected: '&gt 1. item\n&gt 2. <>',
        },
        {
            description: 'keeps a plain new line on shift+enter',
            input: '&gt text<>',
            act: () => userEvent.keyboard('{Shift>}{Enter}{/Shift}'),
            expected: '&gt text\n<>',
        },
        {
            description: 'does not touch lines outside a quote',
            input: '- item<>',
            act: enter,
            expected: '- item\n- <>',
        },
        {
            description: 'does nothing when the extension is disabled',
            input: '&gt text<>',
            act: enter,
            options: { enableBlockquoteExtension: false },
            expected: '&gt text\n<>',
        },
        {
            description: 'continues a list inside a quote when the extension is disabled',
            input: '&gt - item<>',
            act: enter,
            options: { enableBlockquoteExtension: false },
            expected: '&gt - item\n&gt - <>',
        },
        {
            description: 'continues a list inside a quote without prefix wrapping',
            input: '&gt 1. item<>',
            act: enter,
            options: { enablePrefixWrappingExtension: false },
            expected: '&gt 1. item\n&gt 2. <>',
        },
        {
            description: 'continues a custom prefix inside a quote',
            input: '&gt - [] todo<>',
            act: enter,
            options: { customPrefixWrapping: ['- [] '] },
            expected: '&gt - [] todo\n&gt - [] <>',
        },
    ]);
});

describe('blockquote extension: backspace', () => {
    run([
        {
            description: 'joins the line with the previous quoted line',
            input: '&gt the quote begins\n&gt <>and continues after accidental break',
            act: backspace,
            expected: '&gt the quote begins <>and continues after accidental break',
        },
        {
            description: 'does not double a space when joining',
            input: '&gt the quote begins \n&gt <>and continues',
            act: backspace,
            expected: '&gt the quote begins <>and continues',
        },
        {
            description: 'removes a paragraph break',
            input: '&gt first\n&gt\n&gt <>second',
            act: backspace,
            expected: '&gt first\n&gt <>second',
        },
        {
            description: 'removes an empty quoted line',
            input: '&gt text\n&gt <>',
            act: backspace,
            expected: '&gt text<>',
        },
        {
            description: 'removes the markers on the first line of a quote',
            input: 'intro\n\n&gt <>text',
            act: backspace,
            expected: 'intro\n\n<>text',
        },
        {
            description: 'removes one level on the first line of a nested quote',
            input: '&gt outer\n&gt &gt <>inner',
            act: backspace,
            expected: '&gt outer\n&gt <>inner',
        },
        {
            description: 'joins the line with a deeper quoted line it already continues',
            input: '&gt &gt inner\n&gt <>text',
            act: backspace,
            expected: '&gt &gt inner <>text',
        },
        {
            description: 'deletes one character inside a code block in the quote',
            input: '&gt ```\n&gt a\n&gt <>b',
            act: backspace,
            expected: '&gt ```\n&gt a\n&gt<>b',
        },
        {
            description: 'deletes one character on shift+backspace',
            input: '&gt the quote begins\n&gt <>and continues',
            act: () => userEvent.keyboard('{Shift>}{Backspace}{/Shift}'),
            expected: '&gt the quote begins\n&gt<>and continues',
        },
        {
            description: 'deletes one character when the caret is after the markers',
            input: '&gt text\n&gt an<>d',
            act: backspace,
            expected: '&gt text\n&gt a<>d',
        },
        {
            description: 'deletes the selection as usual',
            input: '&gt text\n&gt <and> more',
            act: backspace,
            expected: '&gt text\n&gt <> more',
        },
    ]);
});

describe('blockquote extension: paste', () => {
    run([
        {
            description: 'quotes every pasted line',
            input: '&gt intro <>',
            act: () => userEvent.paste('first\nsecond\n\nthird'),
            expected: '&gt intro first\n&gt second\n&gt\n&gt third<>',
        },
        {
            description: 'keeps the markers before the text after the caret',
            input: '&gt a<>b',
            act: () => userEvent.paste('x\n'),
            expected: '&gt ax\n&gt <>b',
        },
        {
            description: 'replaces a quoted selection',
            input: '&gt <old>',
            act: () => userEvent.paste('new\nlines'),
            expected: '&gt new\n&gt lines<>',
        },
        {
            description: 'pastes code lines as they are inside a code block outside a quote',
            input: '```\n&gt a<>',
            act: () => userEvent.paste('x\ny'),
            expected: '```\n&gt ax\ny<>',
        },
        {
            description: 'pastes a single line as usual',
            input: '&gt a<>',
            act: () => userEvent.paste('word'),
            expected: '&gt aword<>',
        },
        {
            description: 'pastes outside a quote as usual',
            input: 'a<>',
            act: () => userEvent.paste('x\ny'),
            expected: 'ax\ny<>',
        },
    ]);
});

describe('commands inside a blockquote', () => {
    run([
        {
            description: 'quote button quotes every selected line',
            commandName: 'block-quotes',
            input: '<a\nb\n\nc>',
            expected: '<&gt a\n&gt b\n&gt\n&gt c>',
        },
        {
            description: 'quote button unquotes when every line is quoted',
            commandName: 'block-quotes',
            input: '<&gt a\n&gt\n&gt b>',
            expected: '<a\n\nb>',
        },
        {
            description: 'quote button removes one nesting level',
            commandName: 'block-quotes',
            input: '<&gt &gt a\n&gt &gt b>',
            expected: '<&gt a\n&gt b>',
        },
        {
            description: 'quote button quotes a mix of quoted and plain lines',
            commandName: 'block-quotes',
            input: '<&gt a\nb>',
            expected: '<&gt &gt a\n&gt b>',
        },
        {
            description: 'quote button keeps the caret on the same character',
            commandName: 'block-quotes',
            input: 'some <>text',
            expected: '&gt some <>text',
        },
        {
            description: 'quote button unquotes the current line',
            commandName: 'block-quotes',
            input: '&gt some <>text',
            expected: 'some <>text',
        },
        {
            description: 'unordered list goes after the markers',
            commandName: 'unordered-list',
            input: '&gt <a\n&gt b>',
            expected: '<&gt * a\n&gt * b>',
        },
        {
            description: 'unordered list is removed after the markers',
            commandName: 'unordered-list',
            input: '&gt <* a\n&gt * b>',
            expected: '<&gt a\n&gt b>',
        },
        {
            description: 'ordered list goes after the markers',
            commandName: 'ordered-list',
            input: '&gt <a\n&gt b>',
            expected: '<&gt 1. a\n&gt 2. b>',
        },
        {
            description: 'headline goes after the markers',
            commandName: 'h2',
            input: '&gt a<>',
            expected: '&gt ## <a>',
        },
        {
            description: 'headline is removed after the markers',
            commandName: 'h2',
            input: '&gt ## a<>',
            expected: '&gt <a>',
        },
        {
            description: 'code block fences carry the markers',
            commandName: 'code-block',
            input: '&gt <a\n&gt b>',
            expected: '&gt ```\n&gt <a\n&gt b>\n&gt ```',
        },
        {
            description: 'code block on an empty quoted line inserts a placeholder',
            commandName: 'code-block',
            input: '&gt <>',
            expected: '&gt ```\n&gt <code block>\n&gt ```',
        },
        {
            description: 'tab indents after the markers',
            input: '&gt <- a\n&gt - b>',
            act: () => userEvent.keyboard('{Tab}'),
            expected: '<&gt     - a\n&gt     - b>',
        },
        {
            description: 'shift+tab outdents after the markers',
            input: '&gt     <- a>',
            act: () => userEvent.keyboard('{Shift>}{Tab}{/Shift}'),
            expected: '<&gt - a>',
        },
    ]);
});

describe('quote helpers', () => {
    test('splitQuotePrefix', () => {
        expect(splitQuotePrefix('> > - a')).toEqual({ quote: '> > ', rest: '- a', depth: 2 });
        expect(splitQuotePrefix('>>a')).toEqual({ quote: '>>', rest: 'a', depth: 2 });
        expect(splitQuotePrefix('plain > text')).toEqual({ quote: '', rest: 'plain > text', depth: 0 });
    });

    test('pure edits return null outside a quote', () => {
        expect(quoteEnter('text', 4, 4)).toBeNull();
        expect(quoteBackspace('text', 0, 0)).toBeNull();
        expect(quotePaste('text', 4, 4, 'a\nb')).toBeNull();
    });

    test('pure edits return null inside the markers', () => {
        expect(quoteEnter('> text', 1, 1)).toBeNull();
        expect(quoteBackspace('> text', 1, 1)).toBeNull();
    });

    test('fenced code block inside a quote is detected', () => {
        expect(isInsideFencedCodeBlock('> ```\n> code', 12)).toBe(true);
        expect(isInsideFencedCodeBlock('> ```\n> code\n> ```\n> text', 24)).toBe(false);
    });

    test('a quoted fence line does not close a code block outside a quote', () => {
        const value = '```\n> ```\ntext';
        expect(isInsideFencedCodeBlock(value, value.length)).toBe(true);
    });

    test('a code block inside a quote ends with the quote', () => {
        const value = '> ```\n> x\nplain';
        expect(isInsideFencedCodeBlock(value, value.length)).toBe(false);
    });

    test('a code block in a nested quote stays open on deeper lines', () => {
        const value = '> ```\n> > not a quote';
        expect(isInsideFencedCodeBlock(value, value.length)).toBe(true);
    });
});
