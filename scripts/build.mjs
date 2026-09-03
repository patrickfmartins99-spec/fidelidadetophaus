import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raiz = process.cwd();
const destino = path.join(raiz, 'dist');
const arquivos = [
  'bootstrap.js', 'auth.js', 'clientes.js', 'core.js', 'dashboard.js', 'firebase.js',
  'marketing.js', 'totem.js', 'style.css', 'totem.css', 'manifest.json', 'sw.js',
  'logo.jpg', 'qrcode.png', 'qrcode tophaus piçarras.png'
];

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });

for (const arquivo of arquivos) {
  await cp(path.join(raiz, arquivo), path.join(destino, arquivo));
}
await cp(path.join(raiz, 'fragments'), path.join(destino, 'fragments'), { recursive: true });

const tailwindCli = require.resolve('tailwindcss/lib/cli.js');
execFileSync(process.execPath, [
  tailwindCli,
  '-c', path.join(raiz, 'tailwind.config.cjs'),
  '-i', path.join(raiz, 'tailwind.input.css'),
  '-o', path.join(destino, 'tailwind.css'),
  '--minify'
], { stdio: 'inherit' });

const indexOriginal = await readFile(path.join(raiz, 'index.html'), 'utf8');
const indexProdução = indexOriginal.replace(
  '<script src="https://cdn.tailwindcss.com"></script>',
  '<link rel="stylesheet" href="./tailwind.css">'
);
await writeFile(path.join(destino, 'index.html'), indexProdução, 'utf8');

const swOriginal = await readFile(path.join(destino, 'sw.js'), 'utf8');
const swProducao = swOriginal.replace("  './style.css',", "  './style.css',\n  './tailwind.css',");
await writeFile(path.join(destino, 'sw.js'), swProducao, 'utf8');

