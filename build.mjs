import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve('dist');
const publicFiles = [
  'index.html',
  'manifest.json',
  'icon.svg',
  'logo.jpg',
  'style.css',
  'totem.css',
  'app.js',
  'core.js',
  'firebase.js',
  'auth.js',
  'clientes.js',
  'marketing.js',
  'totem.js',
  'dashboard.js',
  'sw.js',
  'qrcode.png',
  'qrcode tophaus piçarras.png'
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const file of publicFiles) {
  await cp(resolve(file), resolve(outputDir, file));
}

execFileSync(
  process.execPath,
  [
    resolve('node_modules/tailwindcss/lib/cli.js'),
    '-c', resolve('tailwind.config.js'),
    '-i', resolve('tailwind.input.css'),
    '-o', resolve(outputDir, 'tailwind.css'),
    '--minify'
  ],
  { stdio: 'inherit' }
);
