/* Baixa a relacao de postos de gasolina de Goiania do GasoRadar e monta uma
 * base local (data/postos-goiania.json) que o app carrega offline.
 *
 * Por que nao buscar em tempo de execucao: o site nao manda cabecalho de
 * CORS, entao o fetch dentro do WebView seria bloqueado. Aqui a gente
 * "congela" um retrato dos postos (nome, bandeira, endereco, coordenadas e
 * precos) e embute no APK. Rode de novo quando quiser atualizar:
 *
 *     node scripts/baixar-postos.js
 */

'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const BASE = 'https://www.gasoradar.com.br';
const CONC = 4;
const SAIDA = path.join(__dirname, '..', 'data', 'postos-goiania.json');

function baixar(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pt-BR' }
    }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return resolve(baixar(new URL(r.headers.location, url).href));
      }
      let d = '';
      r.on('data', (c) => d += c);
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    }).on('error', reject);
  });
}

function decodificar(s) {
  return String(s == null ? '' : s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function numero(s) {
  const t = decodificar(s).replace(/\s/g, '');
  if (!t || /^-+$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parsePosto(html, id) {
  const mNome = html.match(/<h1>\s*([^<]+?)\s*<\/h1>/);
  const nome = mNome ? decodificar(mNome[1]) : '';

  const mBandeira = html.match(/gas_station_images\/[^"]+"\s+alt="([^"]*)"\s+class="img-fluid/);
  const bandeira = mBandeira ? decodificar(mBandeira[1]) : '';

  const mEnd = html.match(/<p>([^<]+)<br>([^<]*)<\/p>/);
  const rua = mEnd ? decodificar(mEnd[1]) : '';
  const bairro = mEnd ? decodificar(mEnd[2]) : '';

  const mCidade = html.match(/<p><a href="[^"]*postos-de-gasolina[^"]*"[^>]*>([^<]+)<\/a><\/p>/);
  const cidade = mCidade ? decodificar(mCidade[1]) : '';

  const mCoord = html.match(/maps\/embed\/v1\/view\?key=[^&]+&center=(-?[0-9.]+),(-?[0-9.]+)/);
  let lat = mCoord ? Number(mCoord[1]) : null;
  let lon = mCoord ? Number(mCoord[2]) : null;

  // Algumas paginas trazem o centro do mapa com latitude e longitude
  // invertidas. No Brasil a latitude fica entre ~+6 e ~-34: se o "lat" cai
  // fora dessa faixa mas o outro numero PARECE uma latitude, troca os dois.
  if (lat != null && lon != null &&
      (lat < -36 || lat > 7) && (lon >= -36 && lon <= 7)) {
    const t = lat; lat = lon; lon = t;
  }

  const precos = { gc: null, ga: null, etanol: null, diesel: null, gnv: null };
  const chaves = { '1': 'gc', '2': 'ga', '3': 'etanol', '4': 'diesel', '5': 'gnv' };
  const re = /<h4 class="preco"[^>]*id="(\d)"[^>]*>\s*([^<]*?)\s*<\/h4>/g;
  let m;
  while ((m = re.exec(html))) {
    const k = chaves[m[1]];
    if (k) precos[k] = numero(m[2]);
  }

  return { id: Number(id), nome, bandeira, rua, bairro, cidade, lat, lon, precos };
}

function idsDaRelacao(html) {
  const set = new Set();
  const re = /posto-de-gasolina\/(\d+)/g;
  let m;
  while ((m = re.exec(html))) set.add(m[1]);
  return [...set];
}

async function mapaLimitado(itens, limite, fn) {
  const out = new Array(itens.length);
  let i = 0;
  async function worker() {
    while (i < itens.length) {
      const idx = i++;
      out[idx] = await fn(itens[idx]);
    }
  }
  await Promise.all(Array.from({ length: limite }, worker));
  return out;
}

(async () => {
  console.log('Buscando relacao de postos...');
  const rel = await baixar(`${BASE}/relacao-postos/Goi%C3%A2nia`);
  const ids = idsDaRelacao(rel.body);
  console.log(`Encontrados ${ids.length} postos. Baixando detalhes...`);

  let feitos = 0;
  const postos = (await mapaLimitado(ids, CONC, async (id) => {
    try {
      const r = await baixar(`${BASE}/posto-de-gasolina/${id}`);
      const p = parsePosto(r.body, id);
      feitos++;
      if (feitos % 25 === 0) console.log(`  ${feitos}/${ids.length}`);
      return p;
    } catch (e) {
      feitos++;
      return null;
    }
  })).filter((p) => p && p.nome);

  const comCoord = postos.filter((p) => p.lat != null).length;
  const comPreco = postos.filter((p) => p.precos.gc != null).length;
  console.log(`OK: ${postos.length} postos | ${comCoord} com coordenadas | ${comPreco} com preco da GC`);

  const saida = {
    fonte: 'GasoRadar (https://www.gasoradar.com.br)',
    cidade: 'Goiania',
    baixadoEm: new Date().toISOString().slice(0, 10),
    total: postos.length,
    postos
  };

  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  fs.writeFileSync(SAIDA, JSON.stringify(saida) + '\n');
  console.log('Salvo em data/postos-goiania.json');
})();
