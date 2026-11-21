/**
 * Serves the browser fixture for the Playwright suite. The bundle is rebuilt in memory on each request and defines
 * `process.env.NODE_ENV` as `production`, so the library runs its browser code paths.
 * Run with `node e2e/serve.ts [port]`: Node 22.18 or later runs TypeScript directly (`devEngines` in package.json).
 */
import * as esbuild from 'esbuild';

const port = Number(process.argv[2] ?? 4173);

const context = await esbuild.context({
    entryPoints: ['e2e/fixture/main.tsx'],
    bundle: true,
    format: 'esm',
    sourcemap: 'inline',
    outdir: 'e2e/fixture',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
});

await context.serve({ host: '127.0.0.1', port, servedir: 'e2e/fixture' });
