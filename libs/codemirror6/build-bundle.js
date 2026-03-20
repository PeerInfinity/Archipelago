/**
 * Build script for CodeMirror 6 bundle
 * Run with: node build-bundle.js
 *
 * This creates a single ES module bundle with all CodeMirror 6 dependencies.
 */

import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['./codemirror6-entry.js'],
  bundle: true,
  format: 'esm',
  outfile: './codemirror6-bundle.js',
  minify: false, // Keep readable for debugging
  sourcemap: true,
  target: ['es2020'],
});

console.log('CodeMirror 6 bundle created: codemirror6-bundle.js');
