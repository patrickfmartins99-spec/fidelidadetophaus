import { readFile } from 'node:fs/promises';

const arquivosSemSegredo = ['totem.js', 'index.html'];
for (const arquivo of arquivosSemSegredo) {
  const conteudo = await readFile(arquivo, 'utf8');
  if (/pin\s*===\s*['\"][^'\"]+['\"]/i.test(conteudo)) {
    throw new Error(`PIN fixo encontrado em ${arquivo}`);
  }
}

JSON.parse(await readFile('database.rules.json', 'utf8'));
console.log('Verificações estáticas concluídas.');

