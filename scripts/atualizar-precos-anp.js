/* Atualiza os precos dos postos de Goiania com a fonte OFICIAL da ANP
 * (Levantamento de Precos de Combustiveis, planilha semanal por revenda).
 *
 * O GasoRadar (usado em scripts/baixar-postos.js) fornece nome/bandeira/
 * endereco/coordenadas, mas os precos dele sao colaborativos e costumam
 * ficar desatualizados. Aqui a gente troca SO os precos pelos da ANP.
 *
 * Como a ANP pesquisa uma AMOSTRA de postos por semana, juntamos as ultimas
 * N semanas (padrao 4) e, para cada posto (CNPJ), ficamos com o preco mais
 * recente disponivel. Postos que nao aparecem em nenhuma dessas semanas
 * ficam com todos os combustiveis nulos (sem preco), para nao exibir valor
 * errado.
 *
 * Uso:
 *     node scripts/atualizar-precos-anp.js            (4 semanas)
 *     ANP_SEMANAS=8 node scripts/atualizar-precos-anp.js
 */

'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const PAGINA = 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas';
const SEMANAS = Math.max(1, Number(process.env.ANP_SEMANAS) || 4);
const SAIDA = path.join(__dirname, '..', 'data', 'postos-goiania.json');

// ---------------------------------------------------------------- download

function baixar(url) {
  return new Promise(function (resolve, reject) {
    const req = require('https').get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pt-BR' }
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(baixar(new URL(res.headers.location, url).href));
        return;
      }
      const partes = [];
      res.on('data', function (c) { partes.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, body: Buffer.concat(partes) }); });
    });
    req.on('error', reject);
  });
}

async function semanasRecentes(n) {
  const r = await baixar(PAGINA);
  if (r.status !== 200) throw new Error('pagina ANP: HTTP ' + r.status);
  const html = r.body.toString('utf8');
  const re = /https?:\/\/[^"'\s<>]+revendas_lpc_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})[^"'\s<>]*\.xlsx/gi;
  const mapa = new Map();
  let m;
  while ((m = re.exec(html))) {
    const fim = m[2];
    if (!mapa.has(fim)) mapa.set(fim, { url: m[0], fim });
  }
  const todas = [...mapa.values()].sort((a, b) => (a.fim < b.fim ? 1 : -1));
  return todas.slice(0, n);
}

/* --- ZIP/XLSX em Node puro (sem dependencias) ------------------------- */

function lerZip(buf) {
  let eocd = -1;
  const minimo = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= minimo; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP invalido (EOCD nao encontrado)');
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const arqs = {};
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('ZIP invalido (diretorio central)');
    const metodo = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nomeLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const comentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const nome = buf.toString('utf8', off + 46, off + 46 + nomeLen);
    const lNomeLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const inicio = localOff + 30 + lNomeLen + lExtraLen;
    const comp = buf.slice(inicio, inicio + compSize);
    if (metodo === 0) arqs[nome] = comp;
    else if (metodo === 8) arqs[nome] = zlib.inflateRawSync(comp);
    off += 46 + nomeLen + extraLen + comentLen;
  }
  return arqs;
}

function decodificar(s) {
  return String(s == null ? '' : s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(Number(d)); });
}

function celulas(linhaXml, shared) {
  const c = {};
  const re = /<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = re.exec(linhaXml))) {
    const v = (m[3].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    const tipo = (m[2].match(/t="([^"]+)"/) || [])[1];
    c[m[1]] = tipo === 's' ? shared[Number(v)] : v;
  }
  return c;
}

// Produto da ANP -> chave usada no app
const PRODUTO_CHAVE = {
  'GASOLINA COMUM': 'gc',
  'GASOLINA ADITIVADA': 'ga',
  'ETANOL': 'etanol',
  'DIESEL S10': 'diesel'
};

function lerGoiania(xlsxBuf) {
  const zip = lerZip(xlsxBuf);
  const sharedXml = zip['xl/sharedStrings.xml'].toString('utf8');
  const shared = [];
  let m;
  const reSi = /<si>([\s\S]*?)<\/si>/g;
  while ((m = reSi.exec(sharedXml))) {
    shared.push(decodificar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  }
  const sheet = zip['xl/worksheets/sheet1.xml'].toString('utf8');
  const registros = [];
  const linhas = sheet.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
  // a planilha tem cabecalho; comeca a valer quando o municipio aparece
  for (const linha of linhas) {
    const c = celulas(linha, shared);
    if (!c.A || !c.I) continue;
    if (String(c.I).toUpperCase() !== 'GOIANIA') continue;
    const chave = PRODUTO_CHAVE[decodificar(c.L)];
    const preco = Number(c.N);
    if (!chave || !isFinite(preco)) continue;
    registros.push({
      cnpj: String(c.A).trim(),
      razao: decodificar(c.B),
      rua: decodificar(c.D),
      numero: String(c.E == null ? '' : c.E).trim(),
      bairro: decodificar(c.G),
      chave,
      preco
    });
  }
  return registros;
}

/* --- casamento de endereco -------------------------------------------- */

const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const TIPOS = new Set(['RUA', 'AVENIDA', 'AV', 'TRAVESSA', 'TV', 'ALAMEDA', 'AL', 'RODOVIA', 'ROD',
  'PRACA', 'PC', 'VIELA', 'ESTRADA', 'CORREDOR', 'VIA', 'QD', 'QUADRA', 'LT', 'LOTE']);
const STOP_NOME = new Set(['POSTO', 'AUTO', 'LTDA', 'EIRELI', 'ME', 'EPP', 'COMERCIO', 'COMBUSTIVEIS',
  'COMBUSTIVEL', 'DERIVADOS', 'PETROLEO', 'SERVICOS', 'SERVICO', 'DE', 'DA', 'DO', 'E', 'EM', 'CENTRO']);
const tokens = (s, stop) => norm(s).split(' ').filter((t) => t && !(stop || TIPOS).has(t));
function jaccard(a, b, stop) {
  const A = new Set(tokens(a, stop)), B = new Set(tokens(b, stop));
  if (!A.size || !B.size) return 0;
  let i = 0;
  A.forEach((t) => { if (B.has(t)) i++; });
  return i / Math.max(A.size, B.size);
}
const soDigitos = (s) => norm(s).replace(/\D/g, '');
const numeroDeRua = (rua) => ((String(rua || '').match(/,\s*(\d+)/) || [])[1] || '');
const nomeDeRua = (rua) => String(rua || '').split(',')[0];

function casar(base, porCnpj) {
  const anp = [...porCnpj.values()];
  const porNumero = new Map();
  anp.forEach((a) => {
    const n = soDigitos(a.numero);
    if (n && n !== '0') {
      const l = porNumero.get(n) || [];
      l.push(a);
      porNumero.set(n, l);
    }
  });

  const pares = [];
  const usadosCnpj = new Set();
  const usadosPosto = new Set();

  // 1a passada: mesmo numero de rua + rua (ou bairro) semelhantes
  for (const p of base.postos) {
    const numero = soDigitos(numeroDeRua(p.rua));
    if (!numero) continue;
    const rua = nomeDeRua(p.rua);
    const bairro = norm(p.bairro);
    for (const a of porNumero.get(numero) || []) {
      const jr = jaccard(rua, a.rua, TIPOS);
      const mesmoBairro = bairro && norm(a.bairro) === bairro;
      if (jr >= 0.6 || (mesmoBairro && jr >= 0.34)) {
        pares.push({ p, a, como: 'endereco' });
        usadosCnpj.add(a.cnpj);
        usadosPosto.add(p.id);
        break;
      }
    }
  }

  // 2a passada: nome muito parecido (para casos com endereco na ANP incompleto)
  for (const a of anp) {
    if (usadosCnpj.has(a.cnpj)) continue;
    let melhor = null, melhorSim = 0;
    for (const p of base.postos) {
      if (usadosPosto.has(p.id)) continue;
      const s = jaccard(a.razao, p.nome, STOP_NOME);
      if (s > melhorSim) { melhorSim = s; melhor = p; }
    }
    if (melhor && melhorSim >= 0.6) {
      pares.push({ p: melhor, a, como: 'nome' });
      usadosCnpj.add(a.cnpj);
      usadosPosto.add(melhor.id);
    }
  }
  return { pares, anp };
}

/* --- fluxo principal --------------------------------------------------- */

(async () => {
  const semanas = await semanasRecentes(SEMANAS);
  if (!semanas.length) throw new Error('nenhuma semana da ANP encontrada');
  console.log('Semanas ANP (' + SEMANAS + '):', semanas.map((s) => s.fim).join(', '));

  const porCnpj = new Map();
  for (const s of semanas) {
    const r = await baixar(s.url);
    if (r.status !== 200) { console.log('  (falha HTTP ' + r.status + ' em ' + s.fim + ')'); continue; }
    const registros = lerGoiania(r.body);
    console.log('  ' + s.fim + ': ' + registros.length + ' registros de Goiania');
    for (const reg of registros) {
      if (!porCnpj.has(reg.cnpj)) {
        porCnpj.set(reg.cnpj, { cnpj: reg.cnpj, razao: reg.razao, rua: reg.rua, numero: reg.numero, bairro: reg.bairro, precos: {} });
      }
      // mais recente vence: as semanas vem da mais nova para a mais antiga
      const alvo = porCnpj.get(reg.cnpj);
      if (alvo.precos[reg.chave] == null) alvo.precos[reg.chave] = reg.preco;
    }
  }
  console.log('Postos da ANP somando as semanas:', porCnpj.size);

  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'postos-goiania.json'), 'utf8'));
  const { pares } = casar(base, porCnpj);

  const porPosto = new Map();
  pares.forEach((par) => porPosto.set(par.p.id, par.a));

  let comPreco = 0;
  base.postos.forEach((p) => {
    const a = porPosto.get(p.id);
    if (a) {
      p.precos = {
        gc: a.precos.gc ?? null,
        ga: a.precos.ga ?? null,
        etanol: a.precos.etanol ?? null,
        diesel: a.precos.diesel ?? null,
        gnv: null
      };
      if (p.precos.gc != null) comPreco++;
    } else {
      p.precos = { gc: null, ga: null, etanol: null, diesel: null, gnv: null };
    }
  });

  const porEndereco = pares.filter((x) => x.como === 'endereco').length;
  console.log('Casados: ' + pares.length + ' (' + porEndereco + ' por endereco, ' + (pares.length - porEndereco) + ' por nome)');
  console.log('Postos com Gasolina Comum (preco real ANP): ' + comPreco + ' de ' + base.postos.length);

  const inicio = semanas[semanas.length - 1].fim;
  const fimSemana = semanas[0].fim;
  base.fonte = 'GasoRadar (endereco/coordenadas) + ANP Levantamento de Precos (precos)';
  base.precoFonte = 'ANP - Levantamento de Precos de Combustiveis';
  base.precoSemanas = inicio + ' a ' + fimSemana;
  base.precoAtualizadoEm = new Date().toISOString().slice(0, 10);
  base.total = base.postos.length;

  fs.writeFileSync(path.join(__dirname, '..', 'data', 'postos-goiania.json'), JSON.stringify(base) + '\n');
  console.log('Salvo em data/postos-goiania.json');
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
