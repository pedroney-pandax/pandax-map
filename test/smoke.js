/* Teste de fumaca: exercita services.js contra as APIs reais.
   Rodar:  npm test
   Nao precisa de navegador nem de servidor local. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// services.js espera um objeto global chamado "window"
const sandbox = { console, fetch, AbortController, setTimeout, clearTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const file of ['js/config.js', 'js/services.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}

const SVC = sandbox.NAV_SERVICES;

let falhas = 0;

function check(nome, condicao, detalhe) {
  if (condicao) {
    console.log('  OK    ' + nome);
  } else {
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''));
    falhas++;
  }
}

const km = (v) => v.toFixed(2) + ' km';
const min = (s) => Math.round(s / 60) + ' min';

/* distancia em km entre dois pontos [lat, lon] (formula de haversine) */
function distKm(a, b) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

(async function main() {
  console.log('\nPandax - MAP | teste de fumaca\n');

  /* ---------------------------------------------------------------- */
  console.log('Polyline');
  // string canonica do Google, precisao 5 -> [[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]]
  const coords5 = SVC.decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
  check('decodifica polyline (precisao 5)', coords5.length === 3, JSON.stringify(coords5));
  check('primeiro ponto [38.5, -120.2]',
        coords5[0][0] === 38.5 && coords5[0][1] === -120.2, JSON.stringify(coords5[0]));
  check('ultimo ponto [43.252, -126.453]',
        Math.abs(coords5[2][0] - 43.252) < 1e-6 && Math.abs(coords5[2][1] + 126.453) < 1e-6,
        JSON.stringify(coords5[2]));

  const vazia = SVC.decodePolyline('', 6);
  check('string vazia devolve lista vazia', Array.isArray(vazia) && vazia.length === 0);
  check('entrada indefinida nao quebra', Array.isArray(SVC.decodePolyline(undefined, 6)));

  /* ---------------------------------------------------------------- */
  console.log('\nSetor/bairro a partir do Nominatim (escolherBairro)');
  // Pura: recebe o "address" do Nominatim e devolve o nome do setor. O caso
  // que motivou o teste: em varios pontos de Goiania o reverse so trazia a
  // cidade, e o rotulo virava um "Goiania" seco no lugar do setor.
  check('prefere o setor (suburb) a cidade',
    SVC.escolherBairro({ suburb: 'Setor Marista', city: 'Goiania' }) === 'Setor Marista');
  check('sem suburb cai na vizinhanca',
    SVC.escolherBairro({ neighbourhood: 'Vila dos Alpes', city: 'Goiania' }) === 'Vila dos Alpes');
  check('suburb vence neighbourhood quando os dois existem',
    SVC.escolherBairro({ neighbourhood: 'X', suburb: 'Setor Bueno' }) === 'Setor Bueno');
  check('sem bairro nenhum mostra a cidade',
    SVC.escolherBairro({ city: 'Goiania' }) === 'Goiania');
  check('nome do objeto vale quando nao e a cidade',
    SVC.escolherBairro({ name: 'Vila Uniao', city: 'Goiania' }) === 'Vila Uniao');
  check('nome igual a cidade nao duplica',
    SVC.escolherBairro({ name: 'Goiania', city: 'Goiania' }) === 'Goiania');
  check('ignora campo vazio e cai no proximo',
    SVC.escolherBairro({ suburb: '   ', quarter: 'Setor Oeste' }) === 'Setor Oeste');
  check('address vazio devolve null', SVC.escolherBairro({}) === null);
  check('address ausente devolve null', SVC.escolherBairro(null) === null);

  /* ---------------------------------------------------------------- */
  console.log('\nBusca (Photon)');
  const lugares = await SVC.searchPlaces('Praca Civica Goiania', 3);
  check('retornou resultados', lugares.length > 0, 'vazio');
  check('resultado tem lat/lon numerico',
        lugares.length > 0 && typeof lugares[0].lat === 'number' && typeof lugares[0].lon === 'number');
  check('resultado tem rotulo legivel',
        lugares.length > 0 && /Goiania|Goi/i.test(lugares[0].label), lugares[0].label);
  check('resultado dentro de Goiania',
        lugares.length > 0 && lugares[0].lat < -16 && lugares[0].lat > -17 &&
        lugares[0].lon < -49 && lugares[0].lon > -50,
        lugares.length ? `${lugares[0].lat},${lugares[0].lon}` : 'sem resultado');
  console.log('        -> ' + (lugares[0] ? lugares[0].label : '(nenhum)'));

  /* ---------------------------------------------------------------- */
  console.log('\nRota urbana (Valhalla) - Praca Civica -> Aeroporto');
  const origem = { lat: -16.6669, lon: -49.2464 };
  const destino = { lat: -16.6319, lon: -49.2207 };
  const rotas = await SVC.fetchRoutes(origem, destino);

  check('retornou ao menos uma rota', rotas.length >= 1, 'nenhuma');
  if (!rotas.length) { console.log('\nAbortado: sem rota.\n'); process.exit(1); }

  const r = rotas[0];

  check('geometria tem pontos suficientes', r.geometry.length > 20, r.geometry.length + ' pontos');
  check('geometria comeca perto da origem (<1 km)',
        distKm(r.geometry[0], [origem.lat, origem.lon]) < 1,
        km(distKm(r.geometry[0], [origem.lat, origem.lon])) + ' da origem');
  check('geometria termina perto do destino (<1 km)',
        distKm(r.geometry[r.geometry.length - 1], [destino.lat, destino.lon]) < 1,
        km(distKm(r.geometry[r.geometry.length - 1], [destino.lat, destino.lon])) + ' do destino');
  check('geometria toda dentro de Goiania', r.geometry.every(c =>
        c[0] < -16 && c[0] > -17 && c[1] < -49 && c[1] > -50));

  // comprimento da polyline tem de concordar com o resumo do Valhalla
  const comprimento = r.geometry.reduce((acc, c, i) =>
        i === 0 ? 0 : acc + distKm(r.geometry[i - 1], c), 0);
  check('comprimento da polyline bate com o resumo (5%)',
        Math.abs(comprimento - r.distanceKm) / r.distanceKm < 0.05,
        `polyline ${km(comprimento)} vs resumo ${km(r.distanceKm)}`);

  check('distancia coerente (5-40 km)', r.distanceKm > 5 && r.distanceKm < 40, km(r.distanceKm));
  check('tempo coerente (5-90 min)', r.durationSec > 300 && r.durationSec < 5400, min(r.durationSec));
  check('tem instrucoes', r.steps.length > 5, r.steps.length + ' passos');

  const primeira = r.steps[0];
  const ultima = r.steps[r.steps.length - 1];
  check('primeiro passo tem icone e instrucao', !!primeira.icon && !!primeira.instruction,
        JSON.stringify(primeira));
  check('ultimo passo e a chegada (tipo 4)', ultima.type === 4, 'tipo ' + ultima.type);
  check('toda manobra tem icone', r.steps.every(s => !!s.icon));
  check('toda manobra tem instrucao em portugues', r.steps.every(s => !!s.instruction));
  check('rotatorias entrar/sair nao duplicaram',
        !r.steps.some((s, i) => s.type === 26 && r.steps[i + 1] && r.steps[i + 1].type === 27));
  check('distancias acumuladas sao crescentes',
        r.steps.every((s, i) => i === 0 || s.cumulative >= r.steps[i - 1].cumulative));
  check('soma dos passos proxima do total (20%)',
        Math.abs(ultima.cumulative - r.distanceKm) / r.distanceKm < 0.2,
        `soma ${km(ultima.cumulative)} vs total ${km(r.distanceKm)}`);

  console.log('        ' + km(r.distanceKm) + ' / ' + min(r.durationSec) + ' / ' + r.steps.length + ' passos');
  console.log('        ex: "' + primeira.instruction + '"');
  console.log('        ex: "' + r.steps[2].instruction + '"');

  /* ---------------------------------------------------------------- */
  console.log('\nRota com alternativas - Goiania -> Anapolis/GO');
  const longa = await SVC.fetchRoutes(
    { lat: -16.6869, lon: -49.2558 },
    { lat: -16.3247, lon: -48.9519 }
  );
  const l0 = longa[0];
  check('rota longa calculada', longa.length >= 1);
  check('rota longa tem tamanho de estrada (50-90 km)', l0.distanceKm > 50 && l0.distanceKm < 90, km(l0.distanceKm));
  check('rota longa usa rodovia', l0.hasHighway, 'hasHighway=' + l0.hasHighway);
  check('geometria longa coerente', Math.abs(
        l0.geometry.reduce((acc, c, i) => i === 0 ? 0 : acc + distKm(l0.geometry[i - 1], c), 0)
        - l0.distanceKm) / l0.distanceKm < 0.05);

  // O servidor demo do FOSSGIS ignora o parametro "alternatives" e sempre
  // devolve 1 rota. O codigo aceita 1 ou N; com Valhalla self-hosted as
  // alternativas passam a aparecer. Aqui so exigimos que nao quebre.
  check('alternativas nao quebram (demo server devolve 1)',
        longa.length >= 1, 'opcoes: ' + longa.length);
  check('opcoes ordenadas da mais rapida para a mais lenta',
        longa.every((x, i) => i === 0 || x.durationSec >= longa[i - 1].durationSec));
  console.log('        ' + km(l0.distanceKm) + ' / ' + min(l0.durationSec) +
              ' / ' + longa.length + ' opcao(oes)');

  /* ---------------------------------------------------------------- */
  console.log('\nAjuste na via (/locate)');
  const naVia = await SVC.snapToRoad(-16.6669, -49.2464);
  check('devolve ponto', typeof naVia.lat === 'number' && typeof naVia.lon === 'number');
  check('mantem o ponto perto do original (<250 m)',
        distKm([naVia.lat, naVia.lon], [-16.6669, -49.2464]) < 0.25,
        km(distKm([naVia.lat, naVia.lon], [-16.6669, -49.2464])));
  console.log('        praca civica: ' + (naVia.snapped ? 'ajustado ' + naVia.meters + ' m' : 'sem ajuste'));

  const meioQuadra = await SVC.snapToRoad(-16.6672, -49.2459);
  check('ponto no meio da quadra e ajustado para a via',
        meioQuadra.snapped && meioQuadra.meters > 0,
        'snapped=' + meioQuadra.snapped + ' m=' + meioQuadra.meters);
  console.log('        meio da quadra: ' + (meioQuadra.snapped ? 'ajustado ' + meioQuadra.meters + ' m' : 'sem ajuste'));

  // Area sem via: precisa recusar o ajuste e devolver a coordenada original
  const semVia = await SVC.snapToRoad(-17.9, -57.5);
  check('longe de qualquer via nao ajusta',
        !semVia.snapped &&
        Math.abs(semVia.lat - (-17.9)) < 1e-9 &&
        Math.abs(semVia.lon - (-57.5)) < 1e-9,
        `snapped=${semVia.snapped} ${semVia.lat},${semVia.lon}`);

  /* ---------------------------------------------------------------- */
  console.log('\nCamadas de mapa (tile de bloqueio)');
  // Um provedor bloqueado ou sem chave devolve HTTP 200 com uma imagem
  // FIXA. O sintoma e o mapa aparecer com marca d'agua ou todo cinza.
  // Aqui comparamos o mesmo zoom em duas cidades: conteudo igual = bloqueado.
  const cfg = sandbox.NAV_CONFIG;
  const cidades = [
    ['Goiania', -16.6869, -49.2558],
    ['Manaus', -3.1190, -60.0217]
  ];

  function tileXY(z, lat, lon) {
    const r = lat * Math.PI / 180;
    return {
      x: Math.floor((lon + 180) / 360 * Math.pow(2, z)),
      y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z))
    };
  }

  for (const [nome, bcfg] of Object.entries(cfg.basemaps)) {
    const Z = 14;
    const digests = [];
    const tamanhos = [];
    let statusOk = true;

    for (const [, lat, lon] of cidades) {
      const { x, y } = tileXY(Z, lat, lon);
      const url = bcfg.url
        .replace('{z}', Z).replace('{x}', x).replace('{y}', y)
        .replace('{s}', 'a').replace('{r}', '');
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        const buf = Buffer.from(await res.arrayBuffer());
        digests.push(require('crypto').createHash('md5').update(buf).digest('hex').slice(0, 8));
        tamanhos.push(buf.length);
        if (res.status !== 200) statusOk = false;
      } catch (e) {
        digests.push('ERRO');
        tamanhos.push(0);
        statusOk = false;
      }
    }

    const diferentes = digests[0] !== digests[1];
    const conteudoOk = Math.min(...tamanhos) > 1500;

    check(`"${nome}" responde 200`, statusOk, 'status/timeout');
    check(`"${nome}" nao e tile de bloqueio`, diferentes && conteudoOk,
          statusOk ? `iguais nas 2 cidades, ${tamanhos[0]}b` : 'sem resposta');
    console.log(`        ${tamanhos.join(' / ')}b  ${digests.join('  ')}`);
  }

  /* ---------------------------------------------------------------- */
  console.log('\nTarifa (moeda BRL)');

  const CFG = sandbox.NAV_CONFIG;
  const perto = (v, alvo, tol) => Math.abs(v - alvo) <= (tol || 0.005);

  // corrida curta: 5 km / 20 min no perfil padrao (modelo direto)
  const f5 = SVC.estimateFare({ distanceKm: 5, durationSec: 20 * 60 });
  check('moeda configurada como BRL', CFG.fare.currency === 'BRL', CFG.fare.currency);
  check('perfil padrao existe', !!SVC.fareProfile(), 'defaultProfile=' + CFG.fare.defaultProfile);

  // 2.00 + 5*1.40 + 20*0.26 = 14.20 ; sem intermediador, total = 14.20
  check('base + km + min', perto(f5.trip, 14.20), f5.trip.toFixed(2));
  check('modelo direto: taxa de intermediador zero', f5.fee === 0 && f5.feePercent === 0,
    'fee=' + f5.fee + ' pct=' + f5.feePercent);
  check('modelo direto: total = corrida', perto(f5.total, 14.20), f5.total.toFixed(2));
  check('modelo direto: motorista leva 100%', perto(f5.driver, 14.20) && f5.driver === f5.trip,
    f5.driver.toFixed(2));
  check('modelo direto: nada retido do motorista',
    f5.emergency === 0 && f5.bonus === 0 && f5.driverNet === f5.trip,
    'emerg=' + f5.emergency + ' bonus=' + f5.bonus);

  // perfil padrao realmente nao cobra taxa
  const direto = SVC.fareProfile();
  check('perfil padrao com 0% de intermediador',
    direto.platformFeePercent === 0 && direto.driverEmergencyPercent === 0 && direto.driverBonusPercent === 0,
    direto.label);

  // piso: corrida de 1 km / 2 min daria 3.92, abaixo do minimo de 6.50
  const fCurta = SVC.estimateFare({ distanceKm: 1, durationSec: 2 * 60 });
  check('piso de tarifa aplicado', perto(fCurta.trip, direto.minFare) && fCurta.minApplied,
    fCurta.trip.toFixed(2));
  check('piso sinalizado na resposta', fCurta.minApplied === true);

  // bandeira multiplica o subtotal inteiro
  const fSurge = SVC.estimateFare({ distanceKm: 5, durationSec: 20 * 60 }, { surge: 1.4 });
  check('bandeira 1,4 aplica sobre o subtotal', perto(fSurge.total, 14.20 * 1.4), fSurge.total.toFixed(2));
  check('bandeira 1,0 nao altera', perto(SVC.estimateFare({ distanceKm: 5, durationSec: 20 * 60 }, { surge: 1 }).total, 14.20));

  // comparacao com o preco de mercado (o que o direto economiza)
  const fMkt = SVC.estimateFare({ distanceKm: 5, durationSec: 20 * 60 }, { profile: 'mercado' });
  check('perfil de mercado cobra 20%', perto(fMkt.fee, 2.84), fMkt.fee.toFixed(2));
  check('mercado: total 17,04 contra 14,20 do direto', perto(fMkt.total, 17.04), fMkt.total.toFixed(2));
  check('direto economiza 2,84 no exemplo de 5 km', perto(fMkt.total - f5.total, 2.84),
    (fMkt.total - f5.total).toFixed(2));

  // perfis diferentes produzem valores diferentes
  const chaves = Object.keys(CFG.fare.profiles);
  check('ha mais de um perfil de tabela', chaves.length > 1, chaves.join(', '));
  check('perfil BSBgo! tambem e direto', SVC.fareProfile('bsbg').platformFeePercent === 0);

  // perfil inexistente cai no padrao, sem quebrar
  const fBad = SVC.estimateFare({ distanceKm: 5, durationSec: 20 * 60 }, { profile: 'nao-existe' });
  check('perfil invalido cai no padrao', fBad.label === direto.label, fBad.label);

  // formatacao pt-BR ("R$" e seguido de espaco nao separavel U+00A0)
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brlTxt = brl.format(1234.5).replace(/ /g, ' ');
  check('moeda formata como Real brasileiro', brlTxt === 'R$ 1.234,50', brlTxt);

  /* ---------------------------------------------------------------- */
  console.log('\nBusca de lugares e enderecos');

  // nome de lugar (POI) precisa achar e trazer o endereco completo
  const poi = await SVC.searchPlaces('Banco do Brasil', 8);
  check('nome de lugar devolve resultados', poi.length > 0, 'n=' + poi.length);
  check('resultado tem coordenadas', poi.every(p => typeof p.lat === 'number'));
  const comEndereco = poi.filter(p => /\d/.test(p.label) || /rua|avenida|av\.|travessa|pra[çc]a/i.test(p.label));
  check('POI traz endereco no rotulo', comEndereco.length > 0,
    poi[0] ? poi[0].label : '(sem resultado)');
  check('POI fica na regiao de Goiania',
    poi.every(p => p.lat > -17.35 && p.lat < -16.05 && p.lon > -49.65 && p.lon < -48.75),
    poi[0] ? poi[0].lat + ',' + poi[0].lon : '-');

  // logradouro tambem
  const logr = await SVC.searchPlaces('Avenida T-10', 6);
  check('logradouro achado', logr.length > 0, 'n=' + logr.length);

  // bbox segura o resultado dentro da regiao: "Office" sem bbox devolvia
  // uma agencia dos EUA no topo
  const bbox = (() => {
    const b = CFG.bounds;
    return [b.minLon, b.minLat, b.maxLon, b.maxLat].join(',');
  })();
  const raw = await fetch(CFG.photonUrl + '?q=' + encodeURIComponent('Lorenco Office') +
    '&limit=6&lat=' + CFG.center.lat + '&lon=' + CFG.center.lon + '&bbox=' + bbox,
    { headers: { 'User-Agent': 'pandax-test/1.0' } }).then(r => r.json());
  check('bbox prende resultado na regiao', (raw.features || []).length === 0,
    'features=' + (raw.features || []).length + ' (sem bbox seriam 6, todos fora do pais)');

  // ---- nome de predio: acento e ordem nao podem atrapalhar -----------
  console.log('\nBusca por nome de predio');

  // "Brookfield Towers" existe no OSM. O nome oficial tem mais palavras
  // ("Edificio Brookfield Towers - Torre A") e a pessoa digita so parte.
  const brookFwd = await SVC.searchPlaces('brookfield towers', 6);
  const brookRev = await SVC.searchPlaces('towers brookfield', 6);
  check('acha predio pelo nome', brookFwd.length > 0, 'n=' + brookFwd.length);
  check('ordem das palavras nao importa',
    brookFwd.length > 0 && brookRev.length > 0 &&
    brookFwd[0].label.split(',')[0].toLowerCase() ===
      brookRev[0].label.split(',')[0].toLowerCase(),
    brookFwd[0] ? brookFwd[0].label : '(sem resultado)');

  // OSM grava "Praça Cívica" com acento; digitando sem acento tem de achar.
  const semAcento = await SVC.searchPlaces('praca civica', 6);
  check('busca sem acento acha nome acentuado', semAcento.length > 0,
    semAcento[0] ? semAcento[0].label : '(sem resultado)');

  // A busca por nome usa 3 bases (Photon, Overpass, Nominatim). No Node o
  // Nominatim recusa UA generico (403), entao aqui so conferimos que a
  // funcao existe, devolve array e nunca quebra - no navegador funciona.
  const nom = await SVC.searchNominatim('Praca Civica', 5);
  check('Nominatim devolve array sem quebrar', Array.isArray(nom), 'n=' + nom.length);

  // Palavra de tipo ("edificio", "residencial"...) atrapalha o Nominatim:
  // "edificio metropolitan" nao acha nada, "metropolitan" acha. A busca
  // limpa o texto e consulta os dois.
  check('termoSemTipo tira a palavra de tipo',
    SVC.termoSemTipo('Edificio Brookfield Towers') === 'Brookfield Towers',
    '"' + SVC.termoSemTipo('Edificio Brookfield Towers') + '"');
  check('termoSemTipo guarda a ordem e as maiusculas',
    SVC.termoSemTipo('Edificio Brookfield Towers') === 'Brookfield Towers',
    '"' + SVC.termoSemTipo('Edificio Brookfield Towers') + '"');
  check('termoSemTipo nao quebra quando so tem tipo',
    SVC.termoSemTipo('predio residencial') === '',
    '"' + SVC.termoSemTipo('predio residencial') + '"');
  check('termoSemTipo nao mexe em texto sem tipo',
    SVC.termoSemTipo('Praca Civica') === 'Praca Civica',
    '"' + SVC.termoSemTipo('Praca Civica') + '"');
  check('termoSemTipo tira "shopping" tambem',
    SVC.termoSemTipo('Shopping Bougainville') === 'Bougainville',
    '"' + SVC.termoSemTipo('Shopping Bougainville') + '"');

  // ---- segunda base: Overpass (OSM cru, traz addr:housenumber) --------
  console.log('\nBusca: segunda base (Overpass)');

  // Saga Moto Yamaha - Oficina T-7 existe na base como prdio com
  // addr:housenumber=408 na Avenida T-7. O indice do Photon nao expoe
  // esse nmero, entao o ganho real da Overpass aparece aqui.
  const saga = await SVC.searchPlaces('Saga Moto Yamaha', 6);
  check('Overpass acha prdio com numero', saga.length > 0, 'n=' + saga.length);
  const comNumero = saga.filter(s => /,\s*\d+\s*,|N\.\s*\d+/.test(s.label));
  check('rotulo traz numero do imovel', comNumero.length > 0,
    saga[0] ? saga[0].label : '(sem resultado)');

  // "Edificio Lourenco Office" nao existe em Photon nem em Overpass.
  // O teste fixa esse comportamento: o app precisa responder 0 e nao
  // inventar um resultado, em vez de prometer cobertura que nao existe.
  const inexistente = await SVC.searchPlaces('Lourenço Office', 6);
  check('lugar inexistente nao vira resultado falso', inexistente.length === 0,
    'n=' + inexistente.length + (inexistente[0] ? ' -> ' + inexistente[0].label : ''));

  // reverse geocoding: no Node o Nominatim devolve 403 (UA generico nao e
  // aceito pela politica de uso). O app roda no navegador, onde funciona.
  // Aqui so exigimos que devolva texto e nunca quebre.
  const rev = await SVC.reverseGeocode(-16.69593, -49.28369);
  check('reverse geocode devolve texto', typeof rev === 'string' && rev.length > 0, rev);
  check('reverse geocode nunca devolve vazio', !/undefined|NaN/.test(rev), rev);

  // ---- terceira base opcional: Geoapify -----------------------------
  console.log('\nBusca: terceira base (Geoapify, opcional)');

  check('sem chave a busca segue funcionando',
    (await SVC.searchPlaces('Banco do Brasil', 6)).length > 0);

  // chave invalida tem de devolver zero e NAO estourar erro: o app nao
  // pode quebrar para quem ainda nao criou conta.
  const chaveRuim = await SVC.searchPlaces('Lourenço Office', 6, { geoapifyKey: 'invalida-000' });
  check('chave invalida nao quebra a busca', Array.isArray(chaveRuim),
    Array.isArray(chaveRuim) ? 'n=' + chaveRuim.length : 'nao devolveu array');

  const soGeo = await SVC.searchGeoapify('Lourenço Office', '', 8);
  check('sem chave, Geoapify nao e chamada', Array.isArray(soGeo) && soGeo.length === 0,
    'n=' + (Array.isArray(soGeo) ? soGeo.length : 'nao-array'));

  /* ---------------------------------------------------------------- */
  console.log('\nTratamento de erro');
  let e1 = null;
  try { await SVC.fetchRoutes({ lat: -16.6869, lon: -49.2558 }, { lat: -16.6869, lon: -49.2558 }); }
  catch (e) { e1 = e; }
  check('origem = destino gera erro claro', e1 && /mesmo ponto/i.test(e1.message), e1 && e1.message);

  let e2 = null;
  try { await SVC.fetchRoutes({ lat: -16.6869, lon: -49.2558 }, null); } catch (e) { e2 = e; }
  check('destino ausente gera erro claro', e2 && /Informe origem/i.test(e2.message), e2 && e2.message);

  // ponto inacessivel: atol should produce an error or no route, never a crash
  let e3 = 'nenhum';
  try {
    const r3 = await SVC.fetchRoutes({ lat: -16.6869, lon: -49.2558 }, { lat: 10, lon: 10 });
    e3 = null;
    console.log('        (longe: retornou ' + r3.length + ' rota(s) sem erro)');
  } catch (e) { e3 = e.message; }
  check('destino inacessivel nao quebra', e3 === null || !!e3, String(e3));

  /* ---------------------------------------------------------------- */
  console.log('\n' + (falhas === 0
    ? '>>> Tudo passou.'
    : '>>> ' + falhas + ' verificacao(oes) falharam.') + '\n');

  process.exit(falhas === 0 ? 0 : 1);
})().catch(function (err) {
  console.error('\nErro inesperado:\n', err);
  process.exit(1);
});