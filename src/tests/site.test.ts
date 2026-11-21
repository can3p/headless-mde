/**
 * Keeps the project site honest: the playground's catalog (`site/catalog.ts`) is typed against the library, and
 * these checks make sure the behavior doc it ships with covers every extension too.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXTENSIONS } from '../../site/catalog';
import { defaultTextareaMarkdownOptions } from '../lib/types';

const behaviorDoc = readFileSync(join(__dirname, '../../docs/behavior.md'), 'utf8');

describe('project site', () => {
    it.each(Object.keys(EXTENSIONS))('docs/behavior.md describes %s', (name) => {
        expect(behaviorDoc).toContain(`\`${name}\``);
    });

    it('docs/behavior.md states each extension default as the library has it', () => {
        for (const name of Object.keys(EXTENSIONS) as (keyof typeof EXTENSIONS)[]) {
            const state = defaultTextareaMarkdownOptions[name] ? 'on' : 'off';
            expect(behaviorDoc).toContain(`\`${name}\` (${state} by default)`);
        }
    });
});
