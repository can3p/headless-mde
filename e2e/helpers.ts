import { expect, Page, test } from '@playwright/test';
import type { Command, CommandType, TextareaMarkdownOptions } from '../src/lib';
import { formatContent, parseContent } from '../src/tests/notation';

export type OpenConfig = {
    options?: Partial<TextareaMarkdownOptions>;
    /** custom commands, their calls are recorded in `window.calls` */
    commands?: Omit<Command, 'handler'>[];
    /** render the React component in StrictMode instead of `bootstrapTextareaMarkdown` */
    react?: boolean;
    /** wrapped lines, padding and a border instead of the fixed `pre` layout */
    wrap?: boolean;
    /** the textarea in an open shadow root (not with `react`) */
    shadow?: boolean;
};

export const editor = (page: Page) => page.locator('#editor');

export const open = async (page: Page, config: OpenConfig = {}) => {
    const query = new URLSearchParams();
    query.set('options', JSON.stringify(config.options ?? {}));
    query.set('commands', JSON.stringify(config.commands ?? []));
    if (config.react) {
        query.set('react', '1');
    }
    if (config.wrap) {
        query.set('wrap', '1');
    }
    if (config.shadow) {
        query.set('shadow', '1');
    }
    await page.goto(`/index.html?${query}`);
    await page.waitForFunction(() => Boolean(window.editor));
};

/**
 * Sets the value and selection in the test notation (`<` selectionStart, `>` selectionEnd, `&gt` a literal `>`)
 * and focuses the textarea. Uses the native value setter and an `input` event, so a React state follows,
 * the way a browser autofill would; the browser keeps no undo step for it.
 */
export const setValue = async (page: Page, notation: string) => {
    const { text, selectionStart, selectionEnd } = parseContent(notation);
    await editor(page).evaluate(
        (element: HTMLTextAreaElement, data) => {
            element.focus();
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, data.text);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.setSelectionRange(data.selectionStart, data.selectionEnd);
        },
        { text, selectionStart, selectionEnd },
    );
};

/** The current value and selection in the test notation */
export const getValue = (page: Page) =>
    editor(page)
        .evaluate((element: HTMLTextAreaElement) => ({
            value: element.value,
            selectionStart: element.selectionStart,
            selectionEnd: element.selectionEnd,
        }))
        .then(({ value, selectionStart, selectionEnd }) => formatContent(value, selectionStart, selectionEnd));

/** Asserts the value and selection, written in the test notation */
export const expectValue = async (page: Page, notation: string) => {
    const { text, selectionStart, selectionEnd } = parseContent(notation);
    await expect.poll(() => getValue(page)).toBe(formatContent(text, selectionStart, selectionEnd));
};

export const trigger = (page: Page, command: CommandType | string) =>
    page.evaluate((name) => window.editor!.trigger(name), command);

/** Pastes plain text with a trusted paste: the text goes to the clipboard through a real copy */
export const pasteText = async (page: Page, text: string) => {
    const editorHandle = editor(page);
    const selection = await editorHandle.evaluate((element: HTMLTextAreaElement, data) => {
        const helper = document.createElement('textarea');
        helper.id = 'clipboard-helper';
        helper.value = data;
        document.body.append(helper);
        helper.select();
        return [element.selectionStart, element.selectionEnd] as const;
    }, text);
    await page.keyboard.press('ControlOrMeta+c');
    await editorHandle.evaluate((element: HTMLTextAreaElement, [start, end]) => {
        document.getElementById('clipboard-helper')!.remove();
        element.focus();
        element.setSelectionRange(start, end);
    }, selection);
    await page.keyboard.press('ControlOrMeta+v');
};

/**
 * Dispatches a paste of a file and text. Browsers don't let a test put a file on the real clipboard,
 * so this is the one synthetic event of the suite. Returns whether a listener prevented the default.
 */
export const pasteFile = (page: Page, text: string) =>
    editor(page).evaluate((element: HTMLTextAreaElement, data) => {
        const transfer = new DataTransfer();
        transfer.setData('text/plain', data);
        transfer.items.add(new File(['png'], 'image.png', { type: 'image/png' }));
        // read during the dispatch, after the editor's listeners
        let seen = { defaultPrevented: true, files: 0 };
        const record = (event: ClipboardEvent) => {
            seen = { defaultPrevented: event.defaultPrevented, files: event.clipboardData?.files.length ?? 0 };
        };
        window.addEventListener('paste', record, { once: true });
        const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
        // Firefox drops `clipboardData` given to the constructor, an own property works everywhere
        Object.defineProperty(event, 'clipboardData', { value: transfer });
        element.dispatchEvent(event);
        return seen;
    }, text);

export const getText = (page: Page) => editor(page).evaluate((element: HTMLTextAreaElement) => element.value);

/** Presses each key in turn, e.g. `press('Shift+Enter')` */
export const press =
    (...keys: string[]) =>
    async (page: Page) => {
        for (const key of keys) {
            await page.keyboard.press(key);
        }
    };

export type Case = {
    name: string;
    /** value and selection before `act`, in the test notation */
    input: string;
    act: (page: Page) => Promise<unknown>;
    /** value and selection after `act`, in the test notation */
    expected: string;
    config?: OpenConfig;
    /**
     * The edit must be one undo step: `ControlOrMeta+z` brings back the input text
     * and `ControlOrMeta+Shift+z` the expected one
     */
    undo?: boolean;
};

export const expectOneUndoStep = async (page: Page, before: string, after: string) => {
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => getText(page), { message: 'undo' }).toBe(parseContent(before).text);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => getText(page), { message: 'redo' }).toBe(parseContent(after).text);
};

export const runCases = (cases: Case[], config: OpenConfig = {}) => {
    for (const c of cases) {
        test(c.name, async ({ page }) => {
            await open(page, { ...config, ...c.config, options: { ...config.options, ...c.config?.options } });
            await setValue(page, c.input);
            await c.act(page);
            await expectValue(page, c.expected);
            if (c.undo) {
                await expectOneUndoStep(page, c.input, c.expected);
            }
        });
    }
};
