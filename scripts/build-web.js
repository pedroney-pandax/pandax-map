/* Monta a pasta www/ que o app Android consome.
 *
 * O projeto tem index.html, css/, js/ e vendor/ na raiz, mas tambem
 * server.js, test/ e package.json. O Capacitor copia a webDir inteira
 * para dentro do APK, entao apontar para a raiz Mandaria o servidor e os
 * testes junto. Aqui a gente monta so o que roda no WebView.
 *
 * Roda antes de todo "cap sync": npm run build:web
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// O que entra no app. Tudo que o index.html carrega em tempo de execucao.
const ITENS = ['index.html', 'css', 'js', 'vendor', 'img', 'data'];

function copiar(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const nome of fs.readdirSync(src)) {
      copiar(path.join(src, nome), path.join(dest, nome));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Recomeca limpo: arquivo apagado da raiz nao pode sobreviver no APK.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const faltando = [];
for (const item of ITENS) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    faltando.push(item);
    continue;
  }
  copiar(src, path.join(OUT, item));
}

if (faltando.length) {
  console.error('Faltando no projeto: ' + faltando.join(', '));
  process.exit(1);
}

// Guarda contra o erro classico: app abrindo em branco porque o
// index.html nao foi copiado.
if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('www/index.html nao foi gerado.');
  process.exit(1);
}

function contar(dir) {
  let n = 0;
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    n += fs.statSync(p).isDirectory() ? contar(p) : 1;
  }
  return n;
}

/* Hash do conteudo EXCETO version.json (que acabamos de escrever e nao
 * pode medir a si mesmo). O app compara esse hash com o da base: mudou
 * qualquer arquivo, tem atualizacao para oferecer — mesmo que o numero de
 * versao tenha ficado igual por esquecimento. */
function hashConteudo() {
  const h = crypto.createHash('sha256');
  const arquivos = [];
  (function anda(dir, prefixo) {
    for (const nome of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, nome);
      const rel = prefixo + nome;
      if (rel === 'version.json') continue;
      if (fs.statSync(p).isDirectory()) {
        anda(p, rel + '/');
      } else {
        arquivos.push(rel);
      }
    }
  })(OUT, '');
  for (const rel of arquivos) {
    const f = path.join(OUT, rel);
    h.update(rel + ':' + fs.readFileSync(f) + '\n');
  }
  return h.digest('hex');
}

/* A identidade da versao: numero (para exibir) e hash (para detectar
 * mudanca). O numero vem do package.json; so muda quando voce quiser
 * anunciar, o hash muda sozinho a cada alteracao. */
const conteudo = {
  version: PKG.version,
  hash: hashConteudo()
};
fs.writeFileSync(
  path.join(OUT, 'version.json'),
  JSON.stringify(conteudo, null, 2) + '\n'
);

const bytes = contar(OUT);
console.log('www/ pronto: ' + bytes + ' arquivos (' + ITENS.join(', ') + ')');
console.log('versao ' + conteudo.version + '  hash ' + conteudo.hash.slice(0, 12));