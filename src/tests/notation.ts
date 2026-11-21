/**
 * Test notation for a textarea value with its selection, shared by the jest and the browser (`e2e/`) suites.
 *
 *  `<` - selectionStart
 *  `>` - selectionEnd
 *  @note Use both `<` and `>`, `<>` is a caret
 *  @note Use &lt and &gt to escape `<` and `>`
 */
export const parseContent = (value: string) => {
    const chars = value.replace(/&lt|&gt/g, ' ').split('');
    const text = value.replace(/(<|>)/g, '').replace(/&lt/g, '<').replace(/&gt/g, '>');
    const selectionStart = chars.findIndex((x) => x === '<');
    const selectionEnd = chars.findIndex((x) => x === '>') - 1;
    return { text, selectionEnd, selectionStart };
};

/** The inverse of `parseContent` */
export const formatContent = (text: string, selectionStart: number, selectionEnd: number) => {
    const escape = (part: string) => part.replace(/</g, '&lt').replace(/>/g, '&gt');
    return (
        escape(text.slice(0, selectionStart)) +
        '<' +
        escape(text.slice(selectionStart, selectionEnd)) +
        '>' +
        escape(text.slice(selectionEnd))
    );
};
