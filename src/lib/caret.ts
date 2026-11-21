/** Styles that decide where text lays out inside a textarea, copied to the mirror element */
const MIRRORED_STYLES = [
    'direction',
    'boxSizing',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderStyle',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'whiteSpace',
    'wordWrap',
    'overflowWrap',
    'wordBreak',
] as const;

/**
 * Vertical position of the caret at `position`, in the coordinates of the textarea's scrolled content
 * (`scrollTop` 0 is the top of its padding box). Lays the text out in a hidden mirror element with the
 * textarea's styles, so it works with wrapped lines, padding and any font.
 */
export const getCaretCoordinates = (textarea: HTMLTextAreaElement, position: number) => {
    // the textarea's own document: it may live in an iframe
    const document = textarea.ownerDocument;
    const style = document.defaultView!.getComputedStyle(textarea);
    const mirror = document.createElement('div');

    MIRRORED_STYLES.forEach((property) => {
        mirror.style[property] = style[property];
    });
    // the width text wraps at: the textarea's padding box without its scrollbar
    mirror.style.boxSizing = 'content-box';
    mirror.style.width = `${textarea.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`;
    mirror.style.borderStyle = 'none';
    Object.assign(mirror.style, {
        position: 'absolute',
        visibility: 'hidden',
        top: '0',
        left: '-9999px',
        height: 'auto',
        overflow: 'hidden',
    });

    mirror.textContent = textarea.value.slice(0, position);
    const marker = document.createElement('span');
    // a character after the caret gives the span the height of the caret's line
    marker.textContent = textarea.value.slice(position, position + 1).replace('\n', '') || '.';
    mirror.append(marker);
    document.body.append(mirror);

    const coordinates = { top: marker.offsetTop, height: marker.offsetHeight };
    mirror.remove();
    return coordinates;
};

/**
 * Scrolls the textarea so the caret (the end the selection moves from, as the browser does) is visible,
 * without moving it when it already is. Browsers don't do this after `execCommand`, only after typing.
 */
export const revealCaret = (textarea: HTMLTextAreaElement) => {
    // without layout (hidden, detached, jsdom) there is nothing to scroll
    if (textarea.clientHeight === 0 || textarea.scrollHeight <= textarea.clientHeight) {
        return;
    }

    const focus = textarea.selectionDirection === 'backward' ? textarea.selectionStart : textarea.selectionEnd;
    const { top, height } = getCaretCoordinates(textarea, focus);

    if (top < textarea.scrollTop) {
        textarea.scrollTop = top;
    } else if (top + height > textarea.scrollTop + textarea.clientHeight) {
        textarea.scrollTop = top + height - textarea.clientHeight;
    }
};
