/* Empacota www/ num zip que o app baixa pela base para se atualizar.
 *
 * O app nao reinstala APK: baixa este pacote, extrai nos arquivos internos
 * e o Capacitor passa a servir o conteudo de la. Por isso o zip precisa
 * conter exatamente o que o build-web montou (index.html, css/, js/,
 * vendor/, version.json).
 *
 * Sobrescreve dist/pandax-map-www.zip. Deve rodar depois do build-web:
 *   npm run publicar
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const DIST = path.join(ROOT, 'dist');
const NOME = 'pandax-map-www.zip';

// --- utilidades do formato ZIP ---------------------------------------

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function dosTime(d) {
  const t = d.getHours() << 11 | d.getMinutes() << 5 | (d.getSeconds() >> 1);
  const dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: t, date: dt };
}

function u16(n, b, o) {
  b[o] = n & 0xff;
  b[o + 1] = (n >>> 8) & 0xff;
}

function u32(n, b, o) {
  b[o] = n & 0xff;
  b[o + 1] = (n >>> 8) & 0xff;
  b[o + 2] = (n >>> 16) & 0xff;
  b[o + 3] = (n >>> 24) & 0xff;
}

// --- leitura dos arquivos ----------------------------------------------

function listar(dir) {
  const saida = [];
  (function anda(d, prefixo) {
    for (const nome of fs.readdirSync(d).sort()) {
      const p = path.join(d, nome);
      const rel = prefixo + nome;
      if (fs.statSync(p).isDirectory()) {
        anda(p, rel + '/');
      } else {
        saida.push({ rel, p });
      }
    }
  })(dir, '');
  return saida;
}

// --- montagem do zip (metodo deflate) ----------------------------------

const arquivos = listar(WWW);
if (!arquivos.length || !fs.existsSync(path.join(WWW, 'index.html'))) {
  console.error('www/ vazio ou sem index.html. Rode "node scripts/build-web.js" antes.');
  process.exit(1);
}

// 1. Dados locais + (deferido) as entradas para o diretorio central.
const central = [];
let offsetCorrente = 0;
const pedacos = arquivos.map(({ rel, p }) => {
  const dados = fs.readFileSync(p);
  const comp = zlib.deflateRawSync(dados, { level: 9 });
  const crc = zlib.crc32(dados);
  const nomeBuf = Buffer.from(rel, 'utf8');
  const { time, date } = dosTime(fs.statSync(p).mtime);

  const local = Buffer.alloc(30 + nomeBuf.length);
  u32(SIG_LOCAL, local, 0);
  u16(20, local, 4);          // versao
  u16(0x0800, local, 6);      // flags: UTF-8 nos nomes
  u16(8, local, 8);           // metodo deflate
  u16(time, local, 10);
  u16(date, local, 12);
  u32(crc, local, 14);
  u32(comp.length, local, 18);
  u32(dados.length, local, 22);
  u16(nomeBuf.length, local, 26);
  u16(0, local, 28);
  nomeBuf.copy(local, 30);

  central.push({
    nome: nomeBuf,
    crc,
    comp: comp.length,
    dados: dados.length,
    offset: offsetCorrente,
    time,
    date
  });
  offsetCorrente += local.length + comp.length;

  return { local, comp };
});

// 2. Diretorio central.
const cdInicio = pedacos.reduce((n, b) => n + b.local.length + b.comp.length, 0);
let cdCorrente = cdInicio;
const cds = [];

for (const c of central) {
  const b = Buffer.alloc(46 + c.nome.length);
  u32(SIG_CENTRAL, b, 0);
  u16(20, b, 4);
  u16(20, b, 6);
  u16(0x0800, b, 8);
  u16(8, b, 10);
  u16(c.time, b, 12);
  u16(c.date, b, 14);
  u32(c.crc, b, 16);
  u32(c.comp, b, 20);
  u32(c.dados, b, 24);
  u16(c.nome.length, b, 28);
  u16(0, b, 30);
  u16(0, b, 32);
  u16(0, b, 34);
  u16(0, b, 36);
  u32(0, b, 38);
  u32(c.offset, b, 42);
  c.nome.copy(b, 46);
  cds.push(b);
  cdCorrente += b.length;
}

// 3. Fim do diretorio central (EOCD).
const eocd = Buffer.alloc(22);
u32(SIG_EOCD, eocd, 0);
u16(0, eocd, 4);
u16(0, eocd, 6);
u16(cds.length, eocd, 8);
u16(cds.length, eocd, 10);
u32(cdCorrente - cdInicio, eocd, 12);
u32(cdInicio, eocd, 16);
u16(0, eocd, 20);

fs.mkdirSync(DIST, { recursive: true });
const zip = fs.createWriteStream(path.join(DIST, NOME));
for (const b of pedacos) {
  zip.write(b.local);
  zip.write(b.comp);
}
for (const c of cds) zip.write(c);
zip.write(eocd);
zip.end();

const bytesTotal = pedacos.reduce((n, b) => n + b.local.length + b.comp.length, 0)
  + cds.reduce((n, b) => n + b.length, 0) + eocd.length;

zip.on('close', () => {
  const mb = (bytesTotal / 1024 / 1024).toFixed(2);
  console.log('Pacote pronto: ' + path.join(DIST, NOME) + '  (' + mb + ' MB, ' + arquivos.length + ' arquivos)');
});