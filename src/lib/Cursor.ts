import { revealCaret } from './caret';
import { isBtwOrEq, fireInput, getLines } from './utils';

export type SelectionDirectionType = 'backward' | 'forward' | 'none';

export type Selection = {
    /**
     * List of lines that have been selected
     * @note line is considered selected even if it is partially selected
     * */
    lines: Line[];
    text: string;
    selectionStart: number;
    selectionEnd: number;
    selectionDirection: SelectionDirectionType;
};

type SelectRange = {
    start: number;
    end: number;
};

type SelectRelative = {
    fromCurrentStart: number;
    fromCurrentEnd: number;
};

export type Line = {
    text: string;
    lineNumber: number;

    /** Index of the first character of the string */
    startsAt: number;

    /**
     * Index of the and of the line (includes the characters up to)
     * */
    endsAt: number;
};

export type Position = {
    line: Line;

    /** Starting cursor position */
    cursorAt: number;
};

export type WrapOptions = {
    unwrap?: boolean;
    placeholder?: string;
};

type Marker = string & { __brand: 'Cursor marker' };
const MARKER = `\u0000` as Marker;

/**
 * Util for manipulation with textarea content and text selection
 */
export class Cursor {
    public static MARKER = MARKER;
    public MARKER: typeof MARKER;

    public constructor(private element: HTMLTextAreaElement) {
        this.MARKER = MARKER;
    }

    public get value() {
        return this.element.value;
    }

    /** @returns {Line[]} information about each line of text */
    public get lines(): Line[] {
        return getLines(this.value);
    }

    /** @returns {Selection} information about current selection */
    public get selection(): Selection | null {
        const selectionStart = this.element.selectionStart;
        const selectionEnd = this.element.selectionEnd;
        const selectionDirection = this.element.selectionDirection;
        const text = this.value.slice(selectionStart, selectionEnd);
        const lines = this.lines.filter(
            (line) =>
                // selection starts inside a line
                isBtwOrEq(selectionStart, line.startsAt, line.endsAt) ||
                // selection ends inside a line
                isBtwOrEq(selectionEnd, line.startsAt, line.endsAt) ||
                // line inside selection from left
                isBtwOrEq(line.startsAt, selectionStart, selectionEnd) ||
                // line inside selection from right
                isBtwOrEq(line.endsAt, selectionStart, selectionEnd),
        );

        if (selectionStart === selectionEnd) {
            return null;
        }

        return { lines, selectionStart, selectionEnd, selectionDirection, text };
    }

    /** @returns {Position} information about current position */
    public get position(): Position {
        const position = this.element.selectionStart;
        const line = this.lines.find((line) => position >= line.startsAt && position <= line.endsAt)!;
        return { cursorAt: position, line };
    }

    /**
     * @returns {Line} information about line
     * */
    public lineAt(lineNumber: number): Line | null {
        return this.lines[lineNumber - 1] ?? null;
    }

    /**
     * Insert text at the cursor position.
     * if some content is selected will replace it
     */
    public insert(content: string) {
        const { selectionStart, selectionEnd } = this.element;
        this.applyEdit(selectionStart, selectionEnd, this.normalizeSelection(content));
    }

    /**
     * Insert content and scroll it into view if it's below the visible area.
     * Every edit reveals the caret now, this stays for compatibility.
     */
    public insertAndScrollIntoView(content: string) {
        this.insert(content);
    }

    /**
     * Find and replace text while preserving scroll position and the user's selection,
     * e.g. to swap an upload placeholder while the user types elsewhere
     * @param searchText - Text to find
     * @param replacement - Text to replace with
     */
    public replace(searchText: string, replacement: string) {
        const searchStart = this.value.indexOf(searchText);
        if (searchStart === -1) {
            return; // Text not found
        }
        const searchEnd = searchStart + searchText.length;

        const { selectionStart, selectionEnd, selectionDirection, scrollTop } = this.element;
        // a position after the match moves with it, one inside it goes to the end of the replacement
        const shift = (position: number) =>
            position <= searchStart
                ? position
                : position >= searchEnd
                  ? position + replacement.length - searchText.length
                  : searchStart + replacement.length;

        fireInput(this.element, replacement, searchStart, searchEnd);
        this.element.setSelectionRange(shift(selectionStart), shift(selectionEnd), selectionDirection);
        this.element.scrollTop = scrollTop;
    }

    /**
     * Replace all selected lines
     * if nothing is selected will replace the current line
     *
     * @param callback - The map function will be called once for each selected line and will replace the contents of the line with the result of the call
     * @note line is considered as selected even if it is partially selected
     */
    public replaceCurrentLines(
        callback: (this: Cursor, line: Line, index: number, currentLines: Line[]) => string | null,
        options?: { selectReplaced?: boolean },
    ) {
        const { selectReplaced = false } = options ?? {};
        const selectedLines = this.selection?.lines ?? [this.lineAt(this.position.line.lineNumber)!];

        const content = selectedLines
            .map((line, index) => callback.call(this, line, index, selectedLines))
            .filter((ctn) => ctn !== null) // delete line if null
            .join('\n');

        const start = selectedLines[0].startsAt;
        const end = selectedLines[selectedLines.length - 1].endsAt;

        this.applyEdit(start, end, this.normalizeSelection(content, selectReplaced ? 'SELECT_ALL' : 'TO_END'));
    }

    /**
     * Replace the text between `from` and `to` with `content`.
     * Place the caret or selection with `Cursor.MARKER`, the caret goes to the end of the content by default.
     */
    public replaceRange(from: number, to: number, content: string) {
        this.applyEdit(from, to, this.normalizeSelection(content));
    }

    /**
     * Replace a single line, `null` removes the line
     */
    public replaceLine(lineNumber: number, content: string | null) {
        const line = this.lineAt(lineNumber);
        if (!line) {
            console.error('Unknown line number: ' + lineNumber);
            return;
        }

        if (content === null) {
            // remove the line with the line break before it
            this.applyEdit(line.startsAt - 1, line.endsAt, '');
            return;
        }

        this.applyEdit(line.startsAt, line.endsAt, this.normalizeSelection(content));
    }

    /**
     * Wraps selection inside markup
     */
    public wrap(markup: string | [string, string], options?: WrapOptions) {
        const { unwrap = true, placeholder = '' } = options ?? {};
        const [prefix, suffix] = Array.isArray(markup) ? markup : [markup, markup];
        const text = this.value;
        const start = this.selection?.selectionStart ?? this.position.cursorAt;
        const end = this.selection?.selectionEnd ?? this.position.cursorAt;

        if (this.isSelectedWrappedWith(markup) && unwrap) {
            this.applyEdit(start - prefix.length, end + suffix.length, MARKER + text.slice(start, end) + MARKER);
            return;
        }

        this.applyEdit(start, end, prefix + MARKER + (text.slice(start, end) || placeholder) + MARKER + suffix);
    }

    /**
     * The one way `Cursor` edits the text: replaces `from`-`to` with `content` as a native edit (undo keeps it),
     * places the selection at the `MARKER`s of `content` (one is a caret, none leaves it after the content)
     * and scrolls the caret into view.
     */
    private applyEdit(from: number, to: number, content: string) {
        const data = this.execRaw(content);
        fireInput(this.element, data.text, from, to);

        if (data.selectionStart !== null) {
            this.element.setSelectionRange(
                from + data.selectionStart,
                from + (data.selectionEnd ?? data.selectionStart),
            );
        }

        revealCaret(this.element);
    }

    private isSelectedWrappedWith(markup: string | [string, string]) {
        const [prefix, suffix] = Array.isArray(markup) ? markup : [markup, markup];

        const start = this.selection?.selectionStart ?? this.position.cursorAt;
        const end = this.selection?.selectionEnd ?? this.position.cursorAt;

        if (start - prefix.length < 0 || end - 1 + suffix.length > this.value.length - 1) {
            return false;
        }
        const curPrefix = this.value.slice(start - prefix.length, start);
        const curSuffix = this.value.slice(end, end + suffix.length);
        return curPrefix === prefix && curSuffix === suffix;
    }

    public select(options: SelectRange | SelectRelative) {
        if ('start' in options && 'end' in options) {
            this.element.setSelectionRange(options.start, options.end);
        } else {
            this.element.setSelectionRange(
                this.element.selectionStart + options.fromCurrentStart,
                this.element.selectionEnd + options.fromCurrentEnd,
            );
        }
    }

    private normalizeSelection(text: string, defaultBehavior: 'TO_START' | 'TO_END' | 'SELECT_ALL' = 'TO_END') {
        if (text.includes(MARKER)) {
            return text;
        }

        switch (defaultBehavior) {
            case 'TO_START':
                return `${MARKER}${text}`;
            case 'TO_END':
                return `${text}${MARKER}`;
            case 'SELECT_ALL':
                return `${MARKER}${text}${MARKER}`;
        }
    }

    private execRaw(text: string) {
        const fIndex = text.indexOf(MARKER);
        const lIndex = text.lastIndexOf(MARKER);
        if (fIndex !== -1 && lIndex !== -1) {
            text = text.replace(new RegExp(MARKER, 'g'), '');
        }
        let selectionStart: null | number = null;
        let selectionEnd: null | number = null;

        // TODO: handle case with more than 2 markers
        if (fIndex !== -1) {
            selectionStart = fIndex;
            selectionEnd = lIndex === -1 || lIndex === fIndex ? null : lIndex - 1;
        }

        return { text, selectionStart, selectionEnd };
    }
}
