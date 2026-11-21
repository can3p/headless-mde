/**
 * Browser fixture for the Playwright suite, bundled by esbuild with `process.env.NODE_ENV` set to `production`,
 * so the library runs its browser code paths.
 *
 * Query string:
 * - `options=<json>`: `TextareaMarkdownOptions`
 * - `commands=<json>`: custom commands without handlers, each records its calls in `window.calls`
 * - `react=1`: render the React component in `StrictMode` instead of calling `bootstrapTextareaMarkdown`
 * - `wrap=1`: a textarea with wrapped lines, padding and a border
 * - `shadow=1`: the textarea in an open shadow root, as in a web component
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TextareaMarkdown, { Command, CommandTrigger, Cursor, TextareaMarkdownRef } from '../../src/lib';
import { bootstrapTextareaMarkdown } from '../../src/lib/headless';

export type Editor = { trigger: CommandTrigger; cursor: Cursor };
export type CommandCall = { name: string; isTrusted: boolean | null; key: string | null };

declare global {
    interface Window {
        editor?: Editor;
        calls: CommandCall[];
    }
}

const params = new URLSearchParams(window.location.search);
const options = JSON.parse(params.get('options') ?? '{}');
window.calls = [];
const commands: Command[] = (JSON.parse(params.get('commands') ?? '[]') as Command[]).map((command) => ({
    ...command,
    handler: ({ keyEvent }) => {
        window.calls.push({
            name: String(command.name),
            isTrusted: keyEvent?.isTrusted ?? null,
            key: keyEvent?.key ?? null,
        });
    },
}));

document.body.classList.toggle('wrap', params.get('wrap') === '1');
const root = document.getElementById('root')!;

const ReactEditor = () => {
    const [value, setValue] = useState('');
    const ref = useRef<TextareaMarkdownRef>(null);

    // the parent's effect runs after the component's bootstrap effect, so the ref is ready here
    useEffect(() => {
        window.editor = {
            trigger: (...args) => ref.current!.trigger(...args),
            get cursor() {
                return ref.current!.cursor;
            },
        };
    }, []);

    return (
        <TextareaMarkdown
            id='editor'
            ref={ref}
            options={options}
            commands={commands}
            value={value}
            onChange={(event) => setValue(event.target.value)}
        />
    );
};

if (params.get('react') === '1') {
    createRoot(root).render(
        <StrictMode>
            <ReactEditor />
        </StrictMode>,
    );
} else {
    const textarea = document.createElement('textarea');
    textarea.id = 'editor';
    if (params.get('shadow') === '1') {
        const shadow = root.attachShadow({ mode: 'open' });
        shadow.append(document.querySelector('style')!.cloneNode(true), textarea);
    } else {
        root.append(textarea);
    }
    const { trigger, cursor } = bootstrapTextareaMarkdown(textarea, { options, commands });
    window.editor = { trigger, cursor };
}
