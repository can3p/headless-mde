import { test } from '@playwright/test';
import { expectValue, open, press, runCases, setValue, trigger } from './helpers';

// StrictMode mounts effects twice: the component must end up bootstrapped once
test.describe('React component in StrictMode', () => {
    runCases(
        [
            { name: 'continues a list once', input: '- a<>', act: press('Enter'), expected: '- a\n- <>', undo: true },
            { name: 'continues a quote once', input: '&gt a<>', act: press('Enter'), expected: '&gt a\n&gt <>' },
            { name: 'bold shortcut', input: '<a>', act: press('ControlOrMeta+b'), expected: '**<a>**' },
        ],
        { react: true, options: { enableBlockquoteExtension: true } },
    );

    test('keeps React state in sync with edits', async ({ page }) => {
        await open(page, { react: true });
        await setValue(page, 'a <b>');
        await trigger(page, 'bold');
        await page.keyboard.type('!');
        // bold keeps `b` selected, typing replaces it; React must not bring back an older value
        await expectValue(page, 'a **!<>**');
    });
});
