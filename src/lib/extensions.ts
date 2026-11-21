import { Extension } from './types';
import { isBtwOrEq, isImageURL, isInsideFencedCodeBlock, isURL, metaCombination, mapQuotedContent } from './utils';
import { quotePaste } from './blockquote';
import { backspaceRules } from './backspace';
import { caretContext, firstEdit } from './caretContext';
import { enterEdit, enterRules } from './enter';

import { Cursor } from './Cursor';
import { KeyboardShortcuts } from './keyboard';

/**
 * Whether a keydown is one the editor may take over: nothing handled it yet, it doesn't belong to an IME
 * composition (`keyCode` 229 is how Safari reports the composition-ending Enter) and no modifier is held.
 * `shift` included: `shift+enter` and `shift+backspace` keep the plain textarea behavior.
 */
const isPlainKeyPress = (event: KeyboardEvent) =>
    !event.defaultPrevented &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey;

/**
 * Handle the paste event, if the pasted text is a URL and something is selected, it will be converted to link/image markup.
 */
export const linkPasteExtension: Extension = (textarea) => {
    const cursor = new Cursor(textarea);

    const pasteListener = (event: ClipboardEvent) => {
        const LINK_MARKUP_RE = /\[[^\]]*\]\([^)]*\)/g;

        const clipboard = event?.clipboardData?.getData('text');

        // checks if selected is already inside link or image markup
        const isSelectedInLinkMarkup = (() => {
            if (!cursor.selection) {
                return false;
            }
            // get all links markup ranges
            const linkMarkupRangeList = Array.from(cursor.value.matchAll(LINK_MARKUP_RE)).map(
                (match) => [match.index!, match.index! + match[0].length] as const,
            );

            // check if selected text is inside any of those ranges
            return linkMarkupRangeList.some(
                ([start, end]) =>
                    isBtwOrEq(cursor.selection!.selectionStart, start, end) ||
                    isBtwOrEq(cursor.selection!.selectionEnd, start, end),
            );
        })();

        if (
            // make sure there is something on the clipboard
            !clipboard ||
            // make sure there is url on the clipboard
            !isURL(clipboard) ||
            // make sure there something is selected
            !cursor.selection ||
            // make selected text is not a URL
            isURL(cursor.selection.text) ||
            // make sure that selected is not inside link/image markup
            isSelectedInLinkMarkup
        ) {
            return;
        }

        // prevent default paste behavior
        event?.preventDefault();

        // workaround to avoid code copypaste
        if (isImageURL(clipboard)) {
            cursor.insert(`![${cursor.selection.text}](${clipboard}) ${Cursor.MARKER}`);
        } else {
            cursor.insert(`[${cursor.selection.text}](${clipboard}) ${Cursor.MARKER}`);
        }
    };

    textarea.addEventListener('paste', pasteListener);

    return () => textarea.removeEventListener('paste', pasteListener);
};

/**
 * Handle `tab`/`shift+tab` combination. Will insert or remove an intend depends on selection
 */
export const indentExtension: Extension = (textarea) => {
    const keyboard = new KeyboardShortcuts(textarea);
    const cursor = new Cursor(textarea);

    keyboard.bind('tab', (event) => {
        event?.preventDefault();
        const indent = ' '.repeat(4);

        if (!cursor.selection) {
            // If nothing is selected simply add Indent at the current position
            cursor.insert(`${indent}${Cursor.MARKER}`);
        } else {
            // If user is select line or lines - add Indent for each of this selected line, and keep selection
            // inside a blockquote the indentation goes after the quote markers
            cursor.replaceCurrentLines((line) => mapQuotedContent(line.text, (content) => indent + content), {
                selectReplaced: true,
            });
        }
    });

    keyboard.bind('shift+tab', (event) => {
        event?.preventDefault();
        cursor.replaceCurrentLines(
            (line) => mapQuotedContent(line.text, (content) => content.replace(/^\s{0,4}/, '')),
            // select lines if something was selected
            { selectReplaced: Boolean(cursor.selection) },
        );
    });

    return () => keyboard.reset();
};

/**
 * Handle `enter`: continues lists and custom prefixes (`enablePrefixWrappingExtension`), quotes
 * (`enableBlockquoteExtension`) and corrects `1)` list markers (`enableOrderedListAutoCorrectExtension`).
 * One listener, so the rules run in the order `enterRules` gives, and every Enter is one edit, one undo step.
 */
export const enterExtension: Extension = (textarea, options) => {
    const cursor = new Cursor(textarea);
    const rules = enterRules(options);
    const autoCorrect = options.enableOrderedListAutoCorrectExtension;

    const keydownListener = (event: KeyboardEvent) => {
        if (!isPlainKeyPress(event) || event.key !== 'Enter') {
            return;
        }

        const edit = enterEdit(textarea.value, textarea.selectionStart, textarea.selectionEnd, rules, autoCorrect);
        if (edit) {
            event.preventDefault();
            cursor.replaceRange(edit.from, edit.to, edit.text);
        }
    };

    textarea.addEventListener('keydown', keydownListener);

    return () => textarea.removeEventListener('keydown', keydownListener);
};

export const emDashExtension: Extension = (textarea) => {
    const cursor = new Cursor(textarea);

    const keydownListener = (event: KeyboardEvent) => {
        if ((event.key !== ' ' && event.code !== 'Space') || cursor.selection) {
            return;
        }

        const cursorAt = cursor.position.cursorAt;
        if (cursor.value.slice(cursorAt - 2, cursorAt) !== '--' || isInsideFencedCodeBlock(cursor.value, cursorAt)) {
            return;
        }

        event.preventDefault();
        textarea.setSelectionRange(cursorAt - 2, cursorAt);
        cursor.insert(`— ${Cursor.MARKER}`);
    };

    textarea.addEventListener('keydown', keydownListener);
    return () => textarea.removeEventListener('keydown', keydownListener);
};

export const properLineRemoveBehaviorExtension: Extension = (textarea) => {
    const cursor = new Cursor(textarea);
    const keyboard = new KeyboardShortcuts(textarea);

    keyboard.bind(metaCombination('backspace'), (event) => {
        if (cursor.position.line.text === '') {
            event.preventDefault();
            cursor.replaceLine(cursor.position.line.lineNumber, null);
        }
    });

    return () => keyboard.reset();
};

/**
 * Handle `backspace` right after list markers (`enablePrefixWrappingExtension`; only lists in a quote with
 * just `enableBlockquoteExtension`) and right after quote markers (`enableBlockquoteExtension`).
 * One listener, so the rules run in the order `backspaceRules` gives; without any rule nothing is bound.
 * `shift+backspace` keeps the plain textarea behavior.
 */
export const backspaceExtension: Extension = (textarea, options) => {
    const rules = backspaceRules(options);
    if (rules.length === 0) {
        return;
    }
    const cursor = new Cursor(textarea);

    const keydownListener = (event: KeyboardEvent) => {
        if (!isPlainKeyPress(event) || event.key !== 'Backspace') {
            return;
        }

        const { value, selectionStart, selectionEnd } = textarea;
        const edit = firstEdit(caretContext(value, selectionStart, selectionEnd), rules);
        if (edit) {
            event.preventDefault();
            cursor.replaceRange(edit.from, edit.to, edit.text);
        }
    };

    textarea.addEventListener('keydown', keydownListener);

    return () => textarea.removeEventListener('keydown', keydownListener);
};

/**
 * Pasting several lines into a quote quotes each of them (Enter and Backspace in quotes are
 * `enterExtension`'s and `backspaceExtension`'s).
 */
export const blockquoteExtension: Extension = (textarea) => {
    const cursor = new Cursor(textarea);

    const pasteListener = (event: ClipboardEvent) => {
        const data = event.clipboardData;
        if (event.defaultPrevented || !data || data.files.length > 0) {
            return;
        }

        const { value, selectionStart, selectionEnd } = textarea;
        const edit = quotePaste(value, selectionStart, selectionEnd, data.getData('text/plain'));
        if (edit) {
            event.preventDefault();
            cursor.replaceRange(edit.from, edit.to, edit.text);
        }
    };

    textarea.addEventListener('paste', pasteListener);

    return () => textarea.removeEventListener('paste', pasteListener);
};
