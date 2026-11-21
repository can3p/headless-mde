# How the editor behaves

This page describes what happens when you type, press a key or click a command. It is the reference for
how the editor is supposed to behave: if you change a behavior, change this page in the same pull request.

Throughout the page, `│` marks the caret.

## A few ground rules

- **The textarea stays a textarea.** Nothing is rendered, wrapped or replaced. If a key isn't one the
  editor cares about, the browser handles it as usual.
- **Every edit is one undo step.** Edits go through the browser's native text insertion, so Ctrl+Z / Cmd+Z
  undoes exactly what a key press or a command did, no more and no less.
- **The caret stays in view.** Browsers don't scroll to the caret after a programmatic edit, so the editor
  does it itself.
- **Shift is the escape hatch.** Shift+Enter and Shift+Backspace always do the plain textarea thing, even
  inside lists and quotes.
- **Typing in an input method (IME) is left alone.** While a composition is in progress, for example when
  typing Japanese or Chinese, Enter belongs to the input method, not to the editor.
- **Code is code.** Inside a fenced code block (` ``` `) the editor doesn't continue lists, doesn't turn `--`
  into a dash, and treats `>` as text.

## Commands

Commands are what you wire to toolbar buttons with `trigger('bold')`. A few also have shortcuts.

**Bold, italic, strike-through and inline code** wrap the selection in markup. Bold, italic and
strike-through have shortcuts: `Ctrl/Cmd+B`, `Ctrl/Cmd+I` and `Ctrl/Cmd+Shift+X` (or `Alt+Shift+F5`). With nothing selected, they insert a placeholder such as `**bold**` and select the
word, so you can type over it. Run the same command on text that is already wrapped and the markup comes
off again.

**Headings (h1–h6)** turn the current line into a heading, replacing any heading level it had. Running the
same level again turns the heading back into a plain line.

**Lists (ordered and unordered)** put a marker in front of every selected line, numbering them `1.`, `2.`,
`3.` for an ordered list. If every line already is such a list item, the markers are removed instead, so
the button works as a toggle. The unordered list command only recognizes its own marker (`*` unless
`preferredUnorderedListSyntax` says otherwise), so on a `- item` line it adds a `*` rather than removing the
`-`. An indented item counts as a nested list, so the command adds a marker rather than removing one.

**Block quote** adds a `>` level to the selected lines. If every line that has text is already quoted, it
removes one level instead. On an empty line it inserts `> quote` with the placeholder selected. The caret
stays on the same character it was on.

**Code block** wraps the selection in ` ``` ` fences. **Code** picks for you: a code block when the
selection spans several lines, inline code otherwise.

**Link and image** insert `[text](url)` and `![text](image.png)`, using the selection as the text and
selecting the URL so you can paste over it.

### Commands inside quotes

Commands understand quote markers. A list, heading, code block or indent goes after the `>` markers, so
`> a` becomes `> * a`, not `* > a`. A code block inside a quote wraps whole lines, because its fences need the
markers too.

## Extensions

Extensions are the behaviors that react to typing. Each one has an option, and you can try every one of
them on and off in the playground.

### Lists continue on Enter — `enablePrefixWrappingExtension` (on by default)

Press Enter at the end of a list item and the next line starts with the next marker:

| Before          | After Enter                 |
| --------------- | --------------------------- |
| `* milk│`       | `* milk`, `* │`             |
| `1. first│`     | `1. first`, `2. │`          |
| `1.2. nested│`  | `1.2. nested`, `1.3. │`     |
| `- [x] done│`   | `- [x] done`, `- [ ] │`     |
| `    * deep│`   | keeps the indentation       |
| `> * quoted│`   | `> * quoted`, `> * │`       |

A checked task continues as an unchecked one. Pressing Enter on an empty item ends the list: the marker is
removed, leaving an empty line, and the caret moves to the line below (inside a quote, you stay in the
quote). With the caret before the
item's text, Enter is a plain line break.

The `customPrefixWrapping` option adds your own prefixes to continue, such as `// ` or `| `.

### Ordered list auto-correct — `enableOrderedListAutoCorrectExtension` (off by default)

Some people type `1)` for numbered lists. With this on, pressing Enter on such a line rewrites the marker
to `1.`. If list continuation is on too, the next line gets `2.`; otherwise Enter is a plain line break.
Either way, the correction and the new line are one undo step.

### Quotes take care of themselves — `enableBlockquoteExtension` (off by default)

Without this extension, quote markers are just text and you type them yourself. With it on, they behave the
way you'd expect in an email client:

| Caret                                  | Key       | Result                                            |
| -------------------------------------- | --------- | ------------------------------------------------- |
| `> text│`                              | Enter     | `> text`, `> │`, at the same depth (`>>` stays `>>`) |
| `> - item│`                            | Enter     | `> - item`, `> - │`                               |
| `> - │` (empty item)                   | Enter     | `> │`: leaves the list, stays in the quote        |
| `> │` after a line with text           | Enter     | `>`, `> │`: a paragraph break inside the quote    |
| `> │` after an empty `>` line          | Enter     | leaves one quote level, keeping a blank line      |
| `> a`, `> │b`                          | Backspace | `> a │b`: joins the two lines                     |
| `>`, `> │b` after a paragraph break    | Backspace | removes the break                                 |
| `> │b` on the first line of a quote    | Backspace | `│b`: removes one quote level                     |
| inside a quote                         | Paste of several lines | every line after the first gets the markers, blank lines become `>` |

Inside a code block that sits in a quote, only the markers of that quote are kept; a code block outside any
quote is left completely alone.

### Tab indents — `enableIndentExtension` (on by default)

Tab inserts four spaces at the caret instead of moving focus out of the textarea. With a selection, even
one inside a single line, every line it touches is indented as a whole and the selection is kept; inside a
quote, that indentation goes after the `>` markers. Shift+Tab removes up to four spaces from the start of
each line (after the markers in a quote).

Keep in mind that this means keyboard users can't Tab out of the editor. If that matters for your page,
turn the extension off or give people another way out.

### Pasting a link onto a selection — `enableLinkPasteExtension` (on by default)

Select some text and paste a URL: the text becomes `[text](url)` followed by a space, with the caret after
it. If the URL ends in `.png`, `.jpg`, `.jpeg` or `.gif`, you get an image, `![text](url)`. Anything the
browser accepts as an absolute URL counts, `mailto:` links included. Nothing special happens when nothing is
selected, when the selection is itself a URL, or when it is already inside a link.

### Ctrl/Cmd+Backspace on an empty line — `enableProperLineRemoveBehaviorExtension` (on by default)

On an empty line, Ctrl+Backspace (Cmd+Backspace on a Mac) removes just that line instead of whatever the
browser would delete. On a line with text, the browser's usual behavior applies. (On an empty first line
nothing is removed yet; that is a known bug.)

### Em dashes — `enableEmDashExtension` (on by default)

Type two dashes and a space, `-- `, and they become an em dash and a space: `— `. This doesn't happen inside
a fenced code block, where `--` is usually a command-line flag.

## When extensions meet

Several extensions listen to the same keys, and they are set up in a fixed order so their behavior is
predictable:

1. **Enter** is handled in one place. The rules are tried in turn: your custom prefixes, then lists, then
   quotes. The first that applies wins, so a list inside a quote continues as a list, and only an empty quote
   line triggers the paragraph-break behavior. The ordered list auto-correct happens before any of them.
2. **Paste** goes to the quote extension first, then to the link paste. A single URL pasted onto a selection
   inside a quote still becomes a link.
