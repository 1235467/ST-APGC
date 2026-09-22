import * as esbuild from 'esbuild';

// SillyTavern core modules ('../../../x.js', '/scripts/x.js') must stay
// runtime-resolved in the browser. index.js reaches core files via
// '../../../x.js', which resolves correctly only from the extension root —
// once the bundle sits in dist/, that depth is wrong. Rewrite them to
// absolute URLs ('/scripts/x.js') so they work from any location.
// Only rewrite imports issued by files OUTSIDE vendor/ — relative imports
// inside vendored packages are internal and must be bundled normally.
const stCoreExternals = {
    name: 'st-core-externals',
    setup(build) {
        const isVendored = (importer) => /[/\\]vendor[/\\]/.test(importer);
        build.onResolve({ filter: /^\.\.\/(\.\.\/)+/ }, (args) =>
            isVendored(args.importer)
                ? undefined
                : { path: '/scripts/' + args.path.replace(/^(\.\.\/)+/, ''), external: true },
        );
        build.onResolve({ filter: /^\// }, (args) => ({ path: args.path, external: true }));
    },
};

await esbuild.build({
    entryPoints: ['index.js'],
    bundle: true,
    format: 'esm',
    outfile: 'dist/index.js',
    plugins: [stCoreExternals],
});
