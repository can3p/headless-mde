/**
 * What the playground shows for every extension and command. Both maps are keyed by the library's own types,
 * so adding an `enable*Extension` option or a built-in command fails the typecheck until it is described here.
 */
import { BUILT_IN_COMMANDS, TextareaMarkdownOptions } from '../src/lib/types';

export type ExtensionOption = Extract<keyof TextareaMarkdownOptions, `enable${string}Extension`>;

export type ExtensionInfo = {
    label: string;
    /** One sentence, shown next to the toggle */
    summary: string;
    /** Something to type to see it work */
    tryIt: string;
};

export const EXTENSIONS: Record<ExtensionOption, ExtensionInfo> = {
    enablePrefixWrappingExtension: {
        label: 'Continue lists',
        summary: 'Enter at the end of a list item starts the next one; Enter on an empty item ends the list.',
        tryIt: 'Put the caret after “milk” and press Enter, then Enter again.',
    },
    enableOrderedListAutoCorrectExtension: {
        label: 'Fix 1) markers',
        summary: 'Enter on a “1)” item rewrites the marker to “1.” (the list continues if “Continue lists” is on).',
        tryIt: 'Type “1) one” on a new line and press Enter.',
    },
    enableBlockquoteExtension: {
        label: 'Quote markers',
        summary: 'Enter, Backspace and multi-line paste keep the > markers in place inside a quote.',
        tryIt: 'Press Enter at the end of a quoted line, then Enter twice on the empty one.',
    },
    enableIndentExtension: {
        label: 'Tab indents',
        summary: 'Tab and Shift+Tab indent and outdent instead of moving focus.',
        tryIt: 'Select a few lines and press Tab, then Shift+Tab.',
    },
    enableLinkPasteExtension: {
        label: 'Paste links',
        summary: 'Pasting a URL onto selected text makes a link (or an image for .png, .jpg, .gif).',
        tryIt: 'Copy a URL, select a word and paste.',
    },
    enableProperLineRemoveBehaviorExtension: {
        label: 'Delete empty line',
        summary: 'Ctrl/Cmd+Backspace on an empty line removes just that line.',
        tryIt: 'Make an empty line and press Ctrl+Backspace (Cmd+Backspace on a Mac).',
    },
    enableEmDashExtension: {
        label: 'Em dashes',
        summary: 'Typing “-- ” turns into “— ”, except inside code blocks.',
        tryIt: 'Type two dashes and a space.',
    },
};

export type BuiltInCommand = (typeof BUILT_IN_COMMANDS)[number];

export type CommandInfo = { label: string; title: string };

export const COMMANDS: Record<BuiltInCommand, CommandInfo> = {
    bold: { label: 'B', title: 'Bold (Ctrl/Cmd+B)' },
    italic: { label: 'I', title: 'Italic (Ctrl/Cmd+I)' },
    'strike-through': { label: 'S', title: 'Strike-through (Ctrl/Cmd+Shift+X)' },
    h1: { label: 'H1', title: 'Heading 1' },
    h2: { label: 'H2', title: 'Heading 2' },
    h3: { label: 'H3', title: 'Heading 3' },
    h4: { label: 'H4', title: 'Heading 4' },
    h5: { label: 'H5', title: 'Heading 5' },
    h6: { label: 'H6', title: 'Heading 6' },
    'unordered-list': { label: '• List', title: 'Bulleted list' },
    'ordered-list': { label: '1. List', title: 'Numbered list' },
    'block-quotes': { label: '❝ Quote', title: 'Block quote' },
    'code-inline': { label: '`code`', title: 'Inline code' },
    'code-block': { label: '```', title: 'Code block' },
    code: { label: 'Code', title: 'Inline code or a code block, depending on the selection' },
    link: { label: 'Link', title: 'Link' },
    image: { label: 'Image', title: 'Image' },
};
