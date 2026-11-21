/**
 * Smoke test for the project site (`site/`, served by `node site/build.ts --serve`, see playwright.config.ts):
 * the playground runs the library, its toggles really switch extensions and the docs are on the page.
 */
import { expect, Page, test } from '@playwright/test';
import { BUILT_IN_COMMANDS } from '../src/lib/types';
import { EXTENSIONS } from '../site/catalog';
import { editor, expectValue, setValue } from './helpers';

const SITE = 'http://127.0.0.1:4174/index.html';

const toggle = (page: Page, option: string) => page.locator(`input[name="${option}"]`);

test.beforeEach(async ({ page }) => {
    await page.goto(SITE);
});

test('shows a toggle for every extension, a button for every command and the docs', async ({ page }) => {
    await expect(page.locator('#extensions input[type=checkbox]')).toHaveCount(Object.keys(EXTENSIONS).length);
    await expect(page.locator('#toolbar button')).toHaveCount(BUILT_IN_COMMANDS.length);
    await expect(page.locator('#usage h1')).toHaveText('Getting started');
    await expect(page.locator('#behavior h1')).toHaveText('How the editor behaves');
    await expect(page.locator('#usage a[href="#behavior"]')).toHaveCount(1);
    await expect(page.locator('.version')).toHaveText(/^v\d+\.\d+\.\d+/);
    await expect(page.locator('#preview h1')).toHaveText('Shopping list');
});

test('turning an extension off and on again changes what typing does', async ({ page }) => {
    await setValue(page, 'a<>');
    await page.keyboard.type('-- ');
    await expectValue(page, 'a— <>');

    await toggle(page, 'enableEmDashExtension').uncheck();
    await expect(page.locator('#setup')).toContainText('enableEmDashExtension: false');
    await setValue(page, 'a<>');
    await page.keyboard.type('-- ');
    await expectValue(page, 'a-- <>');

    await toggle(page, 'enableEmDashExtension').check();
    await expect(page.locator('#setup')).not.toContainText('enableEmDashExtension');
    await setValue(page, 'a<>');
    await page.keyboard.type('-- ');
    await expectValue(page, 'a— <>');
});

test('an extension that is off by default can be turned on', async ({ page }) => {
    await setValue(page, '&gt quoted<>');
    await page.keyboard.press('Enter');
    await expectValue(page, '&gt quoted\n<>');

    await toggle(page, 'enableBlockquoteExtension').check();
    await setValue(page, '&gt quoted<>');
    await page.keyboard.press('Enter');
    await expectValue(page, '&gt quoted\n&gt <>');
});

test('toolbar buttons run commands on the selection and the preview follows', async ({ page }) => {
    await setValue(page, 'make <this> bold');
    await page.locator('#toolbar button[data-command="bold"]').click();
    await expectValue(page, 'make **<this>** bold');
    await expect(editor(page)).toBeFocused();
    await expect(page.locator('#preview strong')).toHaveText('this');
});

test('the preview does not run script from the text', async ({ page }) => {
    await setValue(page, '&ltimg src=x onerror="window.pwned = true"&gt\n\n&ltscript&gtwindow.pwned = true&lt/script&gt<>');
    await expect(page.locator('#preview img')).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { pwned?: boolean }).pwned)).toBeUndefined();
    await expect(page.locator('#preview img')).not.toHaveAttribute('onerror');
});
