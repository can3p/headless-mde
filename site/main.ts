/**
 * The playground on the project site: a textarea driven by the library, a toolbar with every built-in command,
 * a toggle for every extension and a live preview. Bundled by `site/build.ts` from the library sources.
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { bootstrapTextareaMarkdown } from '../src/lib/headless';
import { defaultTextareaMarkdownOptions } from '../src/lib/types';
import { BuiltInCommand, COMMANDS, EXTENSIONS, ExtensionOption } from './catalog';

const SAMPLE = `# Shopping list

* milk
* bread

1. Find the store
2. Buy things

> Quotes keep their markers when "Quote markers" is on.
> Press Enter at the end of this line.

Type two dashes and a space here:

\`\`\`
inside code, -- stays as it is
\`\`\`
`;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const textarea = byId<HTMLTextAreaElement>('editor');
const toolbar = byId<HTMLDivElement>('toolbar');
const toggles = byId<HTMLDivElement>('extensions');
const preview = byId<HTMLDivElement>('preview');
const setupCode = byId<HTMLElement>('setup');

const extensionNames = Object.keys(EXTENSIONS) as ExtensionOption[];
const enabled = Object.fromEntries(
    extensionNames.map((name) => [name, defaultTextareaMarkdownOptions[name]]),
) as Record<ExtensionOption, boolean>;

let editor = bootstrapTextareaMarkdown(textarea, { options: enabled });

/** Re-creates the editor with the current toggles; the text and selection stay as they are */
const rebootstrap = () => {
    editor.dispose();
    editor = bootstrapTextareaMarkdown(textarea, { options: enabled });
    renderSetup();
};

/** The `bootstrapTextareaMarkdown` call that reproduces the playground, listing only what differs from defaults */
const renderSetup = () => {
    const changed = extensionNames.filter((name) => enabled[name] !== defaultTextareaMarkdownOptions[name]);
    const options = changed.map((name) => `        ${name}: ${enabled[name]},`).join('\n');
    setupCode.textContent = [
        `import { bootstrapTextareaMarkdown } from '@can3p/headless-mde/headless';`,
        '',
        changed.length === 0
            ? 'const editor = bootstrapTextareaMarkdown(textarea);'
            : `const editor = bootstrapTextareaMarkdown(textarea, {\n    options: {\n${options}\n    },\n});`,
    ].join('\n');
};

const renderPreview = () => {
    // the text is whatever the visitor typed or pasted: never let it run script
    preview.innerHTML = DOMPurify.sanitize(marked.parse(textarea.value, { async: false }));
};

for (const [name, info] of Object.entries(COMMANDS) as [BuiltInCommand, (typeof COMMANDS)[BuiltInCommand]][]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = info.label;
    button.title = info.title;
    button.dataset.command = name;
    // keep the focus, and with it the selection, in the textarea
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => editor.trigger(name));
    toolbar.append(button);
}

for (const name of extensionNames) {
    const info = EXTENSIONS[name];
    const label = document.createElement('label');
    label.className = 'toggle';
    label.title = info.tryIt;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    input.checked = enabled[name];
    input.addEventListener('change', () => {
        enabled[name] = input.checked;
        rebootstrap();
    });

    const text = document.createElement('span');
    text.innerHTML = '<strong></strong><small></small><code></code>';
    text.querySelector('strong')!.textContent = info.label;
    text.querySelector('small')!.textContent = `${info.summary} ${info.tryIt}`;
    text.querySelector('code')!.textContent = name;

    label.append(input, text);
    toggles.append(label);
}

byId<HTMLButtonElement>('reset').addEventListener('click', () => {
    textarea.value = SAMPLE;
    renderPreview();
    textarea.focus();
});

textarea.value = SAMPLE;
textarea.addEventListener('input', renderPreview);
renderPreview();
renderSetup();
