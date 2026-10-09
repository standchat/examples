// Maintainers only: rebuild vendor/bitmagic-metahuman.js from your own Bitmagic GDK install.
// Serving or copying the example needs none of this.
//
//   npm install -g @bitmagic/cli          # the GDK; `bitmagic tools` works without Pro
//   npm install --prefix /tmp/gdk-build esbuild@0.25.11
//   node lifelike-host/tools/build-gdk.mjs /tmp/gdk-build/node_modules/esbuild/lib/main.js
//
// The GDK's source stays in your GDK install. The output is compiled code for this page,
// with Bitmagic's licence notice in front, as the licence asks.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { path: toolkit } = JSON.parse(execFileSync('bitmagic', ['tools', 'path', 'metahuman', '--json'], { encoding: 'utf8' }));
const version = execFileSync('bitmagic', ['--version'], { encoding: 'utf8' }).trim();
const { build } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : 'esbuild');
const license = readFileSync(join(here, '../vendor/BITMAGIC-LICENSE.md'), 'utf8');
const source = join(toolkit, 'src/work/metahuman');

await build({
  entryPoints: [join(here, 'gdk-entry.js')],
  outfile: join(here, '../vendor/bitmagic-metahuman.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: false,
  legalComments: 'none',
  external: ['three', 'three/*'],
  alias: {
    'gdk': source,
    'engine/RendererType.js': join(here, 'renderer-type.js'),
  },
  banner: {
    js: `/*!\n * Bitmagic GDK ${version} MetaHuman toolkit (MetaHumanActor, MetaHumanMaterials, MetaHumanSpeech),\n` +
      ` * compiled for this page by tools/build-gdk.mjs. Not public domain.\n *\n` +
      ` * Required Notice: Copyright Bitmagic Oy (https://bitmagic.ai)\n *\n` +
      license.replaceAll('*/', '* /').split('\n').map((line) => ` * ${line}`.trimEnd()).join('\n') + '\n */',
  },
});
console.log(`Built vendor/bitmagic-metahuman.js from Bitmagic GDK ${version}.`);
