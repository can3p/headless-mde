import { expect, test } from '@playwright/test';
import { Case, open, press, runCases, setValue, trigger } from './helpers';

const command =
    (name: string): Case['act'] =>
    (page) =>
        trigger(page, name);

test.describe('toolbar commands', () => {
    runCases([
        { name: 'bold wraps a selection', input: 'a <b> c', act: command('bold'), expected: 'a **<b>** c', undo: true },
        {
            name: 'bold unwraps a selection',
            input: 'a **<b>** c',
            act: command('bold'),
            expected: 'a <b> c',
            undo: true,
        },
        { name: 'bold inserts a placeholder', input: '<>', act: command('bold'), expected: '**<bold>**' },
        { name: 'italic', input: '<a>', act: command('italic'), expected: '*<a>*', undo: true },
        { name: 'strike-through', input: '<a>', act: command('strike-through'), expected: '~~<a>~~' },
        { name: 'h2', input: 'a<>', act: command('h2'), expected: '## <a>', undo: true },
        { name: 'unordered list', input: '<a\nb>', act: command('unordered-list'), expected: '<* a\n* b>', undo: true },
        { name: 'ordered list', input: '<a\nb>', act: command('ordered-list'), expected: '<1. a\n2. b>', undo: true },
        { name: 'quote', input: '<a\n\nb>', act: command('block-quotes'), expected: '<&gt a\n&gt\n&gt b>', undo: true },
        { name: 'code block', input: '<a>', act: command('code-block'), expected: '```\n<a>\n```', undo: true },
        { name: 'inline code', input: '<a>', act: command('code-inline'), expected: '`<a>`' },
    ]);
});

test.describe('shortcuts', () => {
    runCases([
        { name: 'ControlOrMeta+b bolds', input: '<a>', act: press('ControlOrMeta+b'), expected: '**<a>**', undo: true },
        { name: 'ControlOrMeta+i italicizes', input: '<a>', act: press('ControlOrMeta+i'), expected: '*<a>*' },
        {
            name: 'ControlOrMeta+Shift+x strikes through',
            input: '<a>',
            act: press('ControlOrMeta+Shift+x'),
            expected: '~~<a>~~',
        },
    ]);

    test('a custom command gets the trusted key event', async ({ page }) => {
        await open(page, { commands: [{ name: 'custom', shortcut: 'alt+k', shortcutPreventDefault: true }] });
        await setValue(page, 'a<>');
        await page.keyboard.press('Alt+k');
        expect(await page.evaluate(() => window.calls)).toEqual([{ name: 'custom', isTrusted: true, key: 'k' }]);
    });
});
