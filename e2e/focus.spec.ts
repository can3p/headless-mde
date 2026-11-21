import { expect, Page, test } from '@playwright/test';
import { editor, expectValue, getText, open, press, runCases, setValue } from './helpers';

test.describe('textarea in a shadow root', () => {
    // `document.activeElement` is the shadow host there: edits must still be native, so undo works
    runCases(
        [
            { name: 'continues a list', input: '- a<>', act: press('Enter'), expected: '- a\n- <>', undo: true },
            { name: 'bold shortcut', input: '<a>', act: press('ControlOrMeta+b'), expected: '**<a>**', undo: true },
        ],
        { shadow: true },
    );
});

/** The value React holds for the textarea, read from its props */
const reactValue = (page: Page) =>
    editor(page).evaluate((element) => {
        const key = Object.keys(element).find((name) => name.startsWith('__reactProps'))!;
        return (element as unknown as Record<string, { value: string }>)[key].value;
    });

const blurEditor = (page: Page) =>
    editor(page).evaluate((element: HTMLTextAreaElement) => {
        const other = document.createElement('input');
        other.id = 'other';
        document.body.append(other);
        other.focus();
        return document.activeElement !== element;
    });

test.describe('edits while the textarea is not focused', () => {
    test('replace edits the textarea, not the focused field', async ({ page }) => {
        await open(page);
        await setValue(page, 'a ![](uploading…) b<>');
        expect(await blurEditor(page)).toBe(true);
        await page.evaluate(() => window.editor!.cursor.replace('![](uploading…)', '![](a.png)'));
        expect(await getText(page)).toBe('a ![](a.png) b');
        expect(await page.locator('#other').inputValue()).toBe('');
    });

    test('replace updates the state of a React component', async ({ page }) => {
        await open(page, { react: true });
        await setValue(page, 'a ![](uploading…) b<>');
        await blurEditor(page);
        await page.evaluate(() => window.editor!.cursor.replace('![](uploading…)', '![](a.png)'));
        await expect.poll(() => reactValue(page)).toBe('a ![](a.png) b');
        // a re-render keeps the edit
        await editor(page).focus();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        await expectValue(page, 'a ![](a.png) b!<>');
    });
});
