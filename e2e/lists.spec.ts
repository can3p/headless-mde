import { test } from '@playwright/test';
import { press, runCases } from './helpers';

const enter = press('Enter');

test.describe('lists: enter', () => {
    runCases([
        { name: 'continues an unordered list', input: '- a<>', act: enter, expected: '- a\n- <>', undo: true },
        { name: 'keeps the asterisk marker', input: '* a<>', act: enter, expected: '* a\n* <>', undo: true },
        { name: 'increments an ordered list', input: '1. a<>', act: enter, expected: '1. a\n2. <>', undo: true },
        { name: 'increments a nested ordered list', input: '1.1. a<>', act: enter, expected: '1.1. a\n1.2. <>' },
        { name: 'keeps the indent', input: '  - a<>', act: enter, expected: '  - a\n  - <>', undo: true },
        { name: 'splits an item', input: '- ab<>cd', act: enter, expected: '- ab\n- <>cd' },
        { name: 'replaces a selection in an item', input: '- a<bc>', act: enter, expected: '- a\n- <>' },
        { name: 'leaves an empty unordered item', input: '- a\n- <>', act: enter, expected: '- a\n\n<>', undo: true },
        { name: 'leaves an empty ordered item', input: '1. a\n2. <>', act: enter, expected: '1. a\n\n<>' },
        { name: 'is a plain line break outside a list', input: 'a<>', act: enter, expected: 'a\n<>' },
        { name: 'continues a plus list', input: '+ a<>', act: enter, expected: '+ a\n+ <>' },
        { name: 'continues a parenthesis list', input: '1) a<>', act: enter, expected: '1) a\n2) <>', undo: true },
        { name: 'continues a task list', input: '- [x] a<>', act: enter, expected: '- [x] a\n- [ ] <>' },
        { name: 'continues a list in a quote', input: '&gt - a<>', act: enter, expected: '&gt - a\n&gt - <>', undo: true },
        { name: 'leaves a list in a quote', input: '&gt - <>', act: enter, expected: '&gt <>' },
        { name: 'numpad enter continues a list', input: '- a<>', act: press('NumpadEnter'), expected: '- a\n- <>' },
        { name: 'is a plain line break before the marker', input: '<>- a', act: enter, expected: '\n<>- a' },
        {
            name: 'is a plain line break in a code block',
            input: '```\n- a<>\n```',
            act: enter,
            expected: '```\n- a\n<>\n```',
        },
        {
            name: 'keeps going while typing',
            input: '<>',
            act: async (page) => page.keyboard.type('- a\nb\nc'),
            expected: '- a\n- b\n- c<>',
        },
    ]);
});

test.describe('lists: enter that the editor leaves alone', () => {
    // each case types a character afterwards: a continuation queued for a newline that never came would show up there
    runCases([
        { name: 'shift+enter', input: '- a<>', act: press('Shift+Enter', 'x'), expected: '- a\nx<>' },
        { name: 'ctrl+enter', input: '- a<>', act: press('Control+Enter', 'x'), expected: '- ax<>' },
        { name: 'alt+enter', input: '- a<>', act: press('Alt+Enter', 'x'), expected: '- ax<>' },
        {
            name: 'enter prevented by the host page',
            input: '- a<>',
            act: async (page) => {
                await page.evaluate(() =>
                    window.addEventListener('keydown', (event) => event.key === 'Enter' && event.preventDefault(), {
                        capture: true,
                    }),
                );
                await press('Enter', 'x')(page);
            },
            expected: '- ax<>',
        },
    ]);
});

test.describe('ordered list auto-correct', () => {
    runCases(
        [
            { name: 'corrects and continues', input: '1) a<>', act: press('Enter', 'x'), expected: '1. a\n2. x<>' },
            { name: 'corrects a nested item', input: '1.1)a<>', act: enter, expected: '1.1. a\n1.2. <>' },
            { name: 'is one undo step', input: '1)a<>', act: enter, expected: '1. a\n2. <>', undo: true },
            {
                name: 'corrects without prefix wrapping',
                input: '1)a<>',
                act: press('Enter', 'x'),
                expected: '1. a\nx<>',
                config: { options: { enablePrefixWrappingExtension: false } },
                undo: false,
            },
            { name: 'leaves code blocks alone', input: '```\n1)a<>', act: enter, expected: '```\n1)a\n<>' },
        ],
        { options: { enableOrderedListAutoCorrectExtension: true } },
    );
});

test.describe('other keys', () => {
    runCases([
        { name: 'em dash on space', input: 'a --<>', act: press('Space'), expected: 'a — <>', undo: true },
        { name: 'no em dash in a code block', input: '```\n--<>', act: press('Space'), expected: '```\n-- <>' },
        { name: 'tab indents', input: 'a<>', act: press('Tab'), expected: 'a    <>', undo: true },
        { name: 'tab indents selected lines', input: '<a\nb>', act: press('Tab'), expected: '<    a\n    b>' },
        { name: 'shift+tab outdents', input: '    <a>', act: press('Shift+Tab'), expected: '<a>' },
        {
            name: 'ctrl+backspace removes an empty line',
            input: 'a\n<>',
            act: press('ControlOrMeta+Backspace'),
            expected: 'a<>',
            undo: true,
        },
    ]);
});
