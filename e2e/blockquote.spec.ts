import { expect, test } from '@playwright/test';
import { expectValue, open, pasteFile, pasteText, press, runCases, setValue } from './helpers';

const enter = press('Enter');
const backspace = press('Backspace');
const paste = (text: string) => (page: Parameters<typeof pasteText>[0]) => pasteText(page, text);
const config = { options: { enableBlockquoteExtension: true } };

// the rows of the README "Blockquotes" table, `│` written as `<>`

test.describe('blockquote: enter', () => {
    runCases(
        [
            { name: 'continues the quote', input: '&gt text<>', act: enter, expected: '&gt text\n&gt <>', undo: true },
            { name: 'keeps the depth', input: '&gt&gt text<>', act: enter, expected: '&gt&gt text\n&gt&gt <>' },
            { name: 'splits a line', input: '&gt some <>text', act: enter, expected: '&gt some \n&gt <>text' },
            {
                name: 'continues a list',
                input: '&gt - item<>',
                act: enter,
                expected: '&gt - item\n&gt - <>',
                undo: true,
            },
            {
                name: 'continues an ordered list',
                input: '&gt 1. item<>',
                act: enter,
                expected: '&gt 1. item\n&gt 2. <>',
            },
            {
                name: 'leaves the list on an empty item',
                input: '&gt - a\n&gt - <>',
                act: enter,
                expected: '&gt - a\n&gt <>',
            },
            {
                name: 'makes a paragraph break',
                input: '&gt text\n&gt <>',
                act: enter,
                expected: '&gt text\n&gt\n&gt <>',
                undo: true,
            },
            { name: 'leaves the quote', input: '&gt text\n&gt\n&gt <>', act: enter, expected: '&gt text\n\n<>' },
            {
                name: 'leaves one nesting level',
                input: '&gt &gt text\n&gt &gt\n&gt &gt <>',
                act: enter,
                expected: '&gt &gt text\n&gt\n&gt <>',
            },
            {
                name: 'only keeps the markers in a quoted code block',
                input: '&gt ```\n&gt - code<>',
                act: enter,
                expected: '&gt ```\n&gt - code\n&gt <>',
            },
            {
                name: 'leaves code outside a quote alone',
                input: '```\n&gt code<>',
                act: enter,
                expected: '```\n&gt code\n<>',
            },
            {
                name: 'shift+enter is a plain break',
                input: '&gt text<>',
                act: press('Shift+Enter'),
                expected: '&gt text\n<>',
            },
            {
                name: 'auto-corrects a list in a quote',
                input: '&gt 1)item<>',
                act: enter,
                expected: '&gt 1. item\n&gt 2. <>',
                config: { options: { enableOrderedListAutoCorrectExtension: true } },
            },
        ],
        config,
    );
});

test.describe('blockquote: backspace', () => {
    runCases(
        [
            { name: 'joins the lines', input: '&gt a\n&gt <>b', act: backspace, expected: '&gt a <>b', undo: true },
            {
                name: 'removes a paragraph break',
                input: '&gt a\n&gt\n&gt <>b',
                act: backspace,
                expected: '&gt a\n&gt <>b',
            },
            {
                name: 'removes the quote on its first line',
                input: 'intro\n\n&gt <>b',
                act: backspace,
                expected: 'intro\n\n<>b',
            },
            {
                name: 'removes one nesting level',
                input: '&gt a\n&gt &gt <>b',
                act: backspace,
                expected: '&gt a\n&gt <>b',
            },
            {
                name: 'deletes a character in a code block',
                input: '&gt ```\n&gt a\n&gt <>b',
                act: backspace,
                expected: '&gt ```\n&gt a\n&gt<>b',
            },
            { name: 'deletes a selection', input: '&gt a\n&gt <bc> d', act: backspace, expected: '&gt a\n&gt <> d' },
            {
                name: 'shift+backspace deletes a character',
                input: '&gt a\n&gt <>b',
                act: press('Shift+Backspace'),
                expected: '&gt a\n&gt<>b',
            },
        ],
        config,
    );
});

test.describe('blockquote: paste', () => {
    runCases(
        [
            {
                name: 'quotes every pasted line',
                input: '&gt intro <>',
                act: paste('first\nsecond\n\nthird'),
                expected: '&gt intro first\n&gt second\n&gt\n&gt third<>',
                undo: true,
            },
            { name: 'quotes CRLF lines', input: '&gt <>', act: paste('a\r\nb'), expected: '&gt a\n&gt b<>' },
            {
                name: 'keeps the markers before the rest',
                input: '&gt a<>b',
                act: paste('x\n'),
                expected: '&gt ax\n&gt <>b',
            },
            {
                name: 'replaces a selection',
                input: '&gt <old>',
                act: paste('new\nlines'),
                expected: '&gt new\n&gt lines<>',
            },
            { name: 'pastes a single line as is', input: '&gt a<>', act: paste('word'), expected: '&gt aword<>' },
            { name: 'pastes outside a quote as is', input: 'a<>', act: paste('x\ny'), expected: 'ax\ny<>' },
            { name: 'pastes code as is', input: '```\n&gt a<>', act: paste('x\ny'), expected: '```\n&gt ax\ny<>' },
        ],
        config,
    );

    test('leaves a paste with a file to the page', async ({ page }) => {
        await open(page, config);
        await setValue(page, '&gt a<>');
        expect(await pasteFile(page, 'x\ny')).toEqual({ defaultPrevented: false, files: 1 });
        await expectValue(page, '&gt a<>');
    });
});

test.describe('blockquote: tab', () => {
    runCases(
        [
            {
                name: 'indents after the markers',
                input: '&gt <- a\n&gt - b>',
                act: press('Tab'),
                expected: '<&gt     - a\n&gt     - b>',
            },
            {
                name: 'outdents after the markers',
                input: '&gt     <- a>',
                act: press('Shift+Tab'),
                expected: '<&gt - a>',
            },
        ],
        config,
    );
});

test.describe('link paste', () => {
    runCases([
        {
            name: 'turns a selection into a link',
            input: 'see <docs>',
            act: paste('https://example.com'),
            expected: 'see [docs](https://example.com) <>',
            undo: true,
        },
        {
            name: 'turns a selection into an image',
            input: '<cat>',
            act: paste('https://example.com/cat.png'),
            expected: '![cat](https://example.com/cat.png) <>',
        },
    ]);
});
