import { expect, Page, test } from '@playwright/test';
import { editor, getText, open, OpenConfig, trigger } from './helpers';

/**
 * The browser is the reference: once an edit has revealed the caret the way typing does, typing one more
 * character doesn't scroll. Every edit in the editor goes through `execCommand`, after which Chromium and
 * WebKit don't reveal the caret themselves.
 */

const lines = (count: number, long = false) =>
    Array.from(
        { length: count },
        (_, i) => `- item ${i + 1}${long && i % 3 === 0 ? ' long words'.repeat(12) : ''}`,
    ).join('\n');

type Prepare = OpenConfig & { value?: string; line: number; scrollTop: number | 'max' | 'caret' };

/**
 * Puts the caret at the end of `line` (1-based) and scrolls to `scrollTop`: `max` for the bottom,
 * `caret` to let focus reveal the caret line, as a click on it would
 */
const prepare = async (page: Page, { value = lines(200), line, scrollTop, ...config }: Prepare) => {
    await open(page, config);
    await editor(page).evaluate(
        (element: HTMLTextAreaElement, data) => {
            element.value = data.value;
            element.focus();
            const offset = data.value.split('\n').slice(0, data.line).join('\n').length;
            element.setSelectionRange(offset, offset);
            if (data.scrollTop === 'caret') {
                element.scrollTop = 0;
                element.blur();
                element.focus();
            } else {
                element.scrollTop = data.scrollTop === 'max' ? element.scrollHeight : data.scrollTop;
            }
        },
        { value, line, scrollTop },
    );
    await settle(page);
};

/** Waits until the browser stops scrolling: WebKit reveals the caret on focus a few frames later */
const settle = async (page: Page) => {
    let previous = -1;
    await expect
        .poll(
            async () => {
                const current = await getScrollTop(page);
                const stable = current === previous;
                previous = current;
                return stable;
            },
            { intervals: [50] },
        )
        .toBe(true);
};

const getScrollTop = (page: Page) => editor(page).evaluate((element: HTMLTextAreaElement) => element.scrollTop);

/** The caret is where typing would put the view, and the view moved by at most `maxMove` px from `from` */
const expectRevealed = async (page: Page, from?: number, maxMove = 40) => {
    // Firefox reveals the caret itself, a frame later
    await settle(page);
    const afterEdit = await getScrollTop(page);
    if (from !== undefined) {
        expect(Math.abs(afterEdit - from), `scrolled from ${from} to ${afterEdit}`).toBeLessThanOrEqual(maxMove);
    }
    await page.keyboard.type('x');
    await expect
        .poll(() => getScrollTop(page), { message: 'typing scrolled: the edit left the caret hidden' })
        .toBeCloseTo(afterEdit, -1);
};

for (const wrap of [false, true]) {
    test.describe(wrap ? 'wrapped lines' : 'unwrapped lines', () => {
        const value = lines(200, wrap);

        test('enter on a list at the bottom reveals the new line', async ({ page }) => {
            await prepare(page, { wrap, value, line: 200, scrollTop: 'max' });
            const before = await getScrollTop(page);
            await page.keyboard.press('Enter');
            await expectRevealed(page, before);
        });

        test('enter on a list in the middle stays put', async ({ page }) => {
            await prepare(page, { wrap, value, line: 100, scrollTop: 'caret' });
            const before = await getScrollTop(page);
            await page.keyboard.press('Enter');
            await expectRevealed(page, before);
        });

        test('enter in a quote at the bottom reveals the new line', async ({ page }) => {
            await prepare(page, {
                wrap,
                value: value.replace(/^- /gm, '> '),
                line: 200,
                scrollTop: 'max',
                options: { enableBlockquoteExtension: true },
            });
            const before = await getScrollTop(page);
            await page.keyboard.press('Enter');
            await expectRevealed(page, before);
        });

        test('toolbar commands at the bottom stay put', async ({ page }) => {
            await prepare(page, { wrap, value, line: 200, scrollTop: 'max' });
            const before = await getScrollTop(page);
            await trigger(page, 'bold');
            await trigger(page, 'unordered-list');
            await trigger(page, 'code-block');
            await expectRevealed(page, before, 80);
        });

        test('a toolbar command in the middle stays put', async ({ page }) => {
            await prepare(page, { wrap, value, line: 100, scrollTop: 'caret' });
            const before = await getScrollTop(page);
            await trigger(page, 'block-quotes');
            await expectRevealed(page, before);
        });
    });
}

test('insertAndScrollIntoView brings a hidden insertion into view', async ({ page }) => {
    await prepare(page, { line: 150, scrollTop: 0 });
    await page.evaluate(() => window.editor!.cursor.insertAndScrollIntoView('\n![image](upload.png)'));
    await expectRevealed(page);
});

test('replace keeps the scroll position and the selection', async ({ page }) => {
    await prepare(page, { line: 1, scrollTop: 0 });
    await page.evaluate(() => window.editor!.cursor.replace('- item 150', '- replaced'));
    await expectRevealed(page, 0, 0);
    expect(await getText(page)).toMatch(/^- item 1x\n[^]*\n- replaced\n/);
});

test('replace shifts a selection after the match', async ({ page }) => {
    await open(page);
    await editor(page).evaluate((element: HTMLTextAreaElement) => {
        element.value = '![](uploading…)\nab';
        element.focus();
        // `b` is selected
        element.setSelectionRange(17, 18);
    });
    await page.evaluate(() => window.editor!.cursor.replace('![](uploading…)', '![](https://example.com/a.png)'));
    await page.keyboard.type('x');
    expect(await getText(page)).toBe('![](https://example.com/a.png)\nax');
});

test('a smart edit in a long document stays fast', async ({ page }) => {
    await prepare(page, { value: lines(2000, true), line: 2000, scrollTop: 'max' });
    const duration = await page.evaluate(() => {
        const started = performance.now();
        window.editor!.trigger('bold');
        return performance.now() - started;
    });
    // generous: measuring the caret builds a mirror of the text before it, ~10ms for 2000 lines locally
    expect(duration).toBeLessThan(250);
});
