import { test } from '@playwright/test';
import { expectValue, open, setValue } from './helpers';

// CDP drives an IME only in Chromium; Firefox and WebKit have no equivalent in Playwright
test.skip(({ browserName }) => browserName !== 'chromium', 'IME input needs the Chromium DevTools protocol');

const cases = [
    { name: 'a list', input: '- a<>', options: {} },
    {
        name: 'an ordered list with auto-correct',
        input: '1) a<>',
        options: { enableOrderedListAutoCorrectExtension: true },
    },
    { name: 'a quote', input: '&gt a<>', options: { enableBlockquoteExtension: true } },
];

for (const c of cases) {
    test(`enter that commits a composition doesn't continue ${c.name}`, async ({ page }) => {
        await open(page, { options: c.options });
        await setValue(page, c.input);
        const cdp = await page.context().newCDPSession(page);

        await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
        // the Enter that commits the composition arrives as a keydown with keyCode 229 while composing
        await cdp.send('Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 229,
            nativeVirtualKeyCode: 229,
        });
        await cdp.send('Input.insertText', { text: 'か' });
        await cdp.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
        });
        await page.keyboard.type('x');

        await expectValue(page, `${c.input.replace('<>', '')}かx<>`);
    });
}
