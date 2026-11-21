/**
 * Builds the project site into `site/dist`: the playground bundled from the library sources, and the docs in
 * `docs/` rendered into the page. `src/tests/site.test.ts` checks that the docs cover every extension.
 *
 * - `node site/build.ts`: build once
 * - `node site/build.ts --serve [port]`: build, then serve `site/dist` (the Playwright suite uses this)
 *
 * Node 22.18 or later runs TypeScript directly (`devEngines` in package.json).
 */
import * as esbuild from 'esbuild';
import { marked } from 'marked';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const out = join(site, 'dist');

const read = (path: string) => readFile(join(root, path), 'utf8');

/** A doc as HTML: links between docs (`behavior.md`) point to their section on the page (`#behavior`) */
const renderDoc = async (name: string) =>
    (await marked.parse(await read(`docs/${name}.md`))).replace(/href="(?:\.\/)?([\w-]+)\.md"/g, 'href="#$1"');

const build = async () => {
    const { version } = JSON.parse(await read('package.json')) as { version: string };

    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });

    await esbuild.build({
        entryPoints: [join(site, 'main.ts')],
        bundle: true,
        format: 'esm',
        minify: true,
        target: 'es2020',
        outfile: join(out, 'main.js'),
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'warning',
    });

    const docs: Record<string, string> = {
        usage: await renderDoc('usage'),
        behavior: await renderDoc('behavior'),
    };
    const html = (await read('site/index.html'))
        .replace(/\{\{version\}\}/g, version)
        .replace(/\{\{doc:([\w-]+)\}\}/g, (_: string, name: string) => {
            if (!(name in docs)) {
                throw new Error(`site/index.html includes an unknown doc "${name}"`);
            }
            return docs[name];
        });

    await writeFile(join(out, 'index.html'), html);
    await copyFile(join(site, 'style.css'), join(out, 'style.css'));
    // GitHub Pages: serve the files as they are
    await writeFile(join(out, '.nojekyll'), '');
};

await build();

const serveAt = process.argv.indexOf('--serve');
if (serveAt === -1) {
    console.warn(`Site built in ${out}`);
} else {
    const port = Number(process.argv[serveAt + 1] ?? 4174);
    const context = await esbuild.context({});
    await context.serve({ host: '127.0.0.1', port, servedir: out });
    console.warn(`Serving ${out} at http://127.0.0.1:${port}/`);
}
