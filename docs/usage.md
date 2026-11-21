# Getting started

headless-mde turns a plain `<textarea>` into a comfortable place to write markdown. It doesn't render
anything and it doesn't bring its own UI. You keep your textarea, your styles and your markdown parser;
the library adds the small things that make typing markdown pleasant: lists that continue when you press
Enter, Tab that indents instead of leaving the field, toolbar commands that wrap your selection, and so on.

Every edit goes through the browser's own editing machinery, so Ctrl+Z / Cmd+Z undoes it like anything you
typed, and the textarea scrolls to keep the caret in view.

## Install

```bash
npm install @can3p/headless-mde
```

The package is ESM only.

## Without React

Point it at any textarea. You get back `trigger` to run commands (for your toolbar buttons), `cursor` to
read and edit the text yourself, and `dispose` to remove every listener.

```js
import { bootstrapTextareaMarkdown } from '@can3p/headless-mde/headless';

const textarea = document.querySelector('textarea');

const { trigger, dispose } = bootstrapTextareaMarkdown(textarea, {
    options: { enableBlockquoteExtension: true },
});

document.querySelector('#bold').addEventListener('click', () => trigger('bold'));
```

The `headless` entry point doesn't import React, so you won't see peer dependency warnings.

## With React

`TextareaMarkdown` renders a textarea and takes every prop a textarea does, plus `options` and `commands`.
The ref is the textarea element with `trigger` and `cursor` added.

```tsx
import { useRef, useState } from 'react';
import TextareaMarkdown, { TextareaMarkdownRef } from '@can3p/headless-mde';

function Editor() {
    const [value, setValue] = useState('');
    const ref = useRef<TextareaMarkdownRef>(null);

    return (
        <>
            <button onClick={() => ref.current?.trigger('bold')}>Bold</button>
            <TextareaMarkdown ref={ref} value={value} onChange={(e) => setValue(e.target.value)} />
        </>
    );
}
```

Already have a textarea component, such as an autosizing one? Wrap it in `TextareaMarkdown.Wrapper` instead;
no extra DOM element is added.

## Options and commands

Behaviors are switched on and off with `enable*Extension` options, and commands can be given shortcuts,
disabled, or added with your own handler:

```js
bootstrapTextareaMarkdown(textarea, {
    options: { enableEmDashExtension: false, preferredUnorderedListSyntax: '-' },
    commands: [
        { name: 'code', shortcut: ['command+/', 'ctrl+/'], shortcutPreventDefault: true },
        { name: 'shrug', handler: ({ cursor }) => cursor.insert(`¯\\_(ツ)_/¯${cursor.MARKER}`) },
    ],
});
```

In a handler, `cursor.MARKER` marks where the caret lands after the edit; two markers select the text between
them. The full list of options, commands and their defaults is in the
[README](https://github.com/can3p/headless-mde#api). What each behavior actually does is described in
[How the editor behaves](behavior.md).
