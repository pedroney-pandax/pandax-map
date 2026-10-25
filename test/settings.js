/* Teste das configuracoes da engrenagem.
   Rodar:  node test/settings.js
   Nao usa rede: roda offline e em milliseconds.

   O foco aqui e o que acontece quando o usuario digita besteira no
   formulario -- campo vazio, letra, numero negativo, JSON corrompido,
   localStorage bloqueado. Nada disso pode quebrar a tela. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

let falhas = 0;

function check(nome, condicao, detalhe) {
  if (condicao) {
    console.log('  OK    ' + nome);
  } else {
    console.log('  FALHA ' + nome + (detalhe !== undefined ? '  -> ' + detalhe : ''));
    falhas++;
  }
}

/* localStorage de mentira, com a mesma interface do navegador.
   modo "bloqueado" simula modo privado / cota cheia, onde todo
   acesso ao storage lanca exception. */
function fakeStorage(modo) {
  const dados = {};
  return {
    getItem(k) {
      if (modo === 'bloqueado') throw new Error('localStorage bloqueado');
      return Object.prototype.hasOwnProperty.call(dados, k) ? dados[k] : null;
    },
    setItem(k, v) {
      if (modo === 'bloqueado') throw new Error('sem espaco');
      dados[k] = String(v);
    },
    removeItem(k) {
      if (modo === 'bloqueado') throw new Error('localStorage bloqueado');
      delete dados[k];
    },
    _dados: dados
  };
}

/* Carrega config.js + settings.js num contexto novo, com o storage escolhido. */
function carregar(modo) {
  const ls = fakeStorage(modo);

  const sandbox = { console, localStorage: ls };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  for (const file of ['js/config.js', 'js/settings.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }

  return { CFG: sandbox.NAV_CONFIG, SET: sandbox.NAV_SETTINGS, ls };
}

const perto = (v, alvo, tol) => Math.abs(v - alvo) <= (tol || 0.0001);

console.log('\nConfiguracoes da engrenagem');

/* ------------------------------------------------------------------ */
console.log('\nChave de provedor de busca');

{
  const { SET } = carregar('limpo');

  check('estado padrao tem chave vazia', SET.padrao().geoapifyKey === '');
  check('chave normaliza espacos e tabs',
    SET.sanitize({ geoapifyKey: '  abc def\t ' }).geoapifyKey === 'abcdef');
  check('chave muito longa e cortada em 120',
    SET.sanitize({ geoapifyKey: 'x'.repeat(500) }).geoapifyKey.length === 120);
  check('chave alfanumerica nao vira NaN',
    SET.sanitize({ geoapifyKey: 'abc123' }).geoapifyKey === 'abc123');
  check('chave ausente vira string vazia',
    SET.sanitize({}).geoapifyKey === '');
  check('chave corrompida nao quebra',
    SET.sanitize({ geoapifyKey: { nao: 'e string' } }).geoapifyKey === '');
  check('chave sobrevive ao roundtrip de save/load', (() => {
    const { SET } = carregar('limpo');
    SET.save({ geoapifyKey: 'minha-chave-123' });
    return SET.load().geoapifyKey === 'minha-chave-123';
  })());
}

/* ------------------------------------------------------------------ */
console.log('\nPadroes');

{
  const { CFG, SET } = carregar('limpo');
  const d = SET.padrao();

  check('estado padrao tem tabela ativa', typeof d.activeProfile === 'string' && d.activeProfile.length > 0, d.activeProfile);
  check('estado padrao tem tarifa personalizada', d.custom && typeof d.custom.perKm === 'number');
  check('padrao mantem modelo direto (0%)', d.custom.platformFeePercent === 0, d.custom.platformFeePercent);
  check('bandeiras padrao incluem a normal 1', d.surgeOptions.indexOf(1) !== -1, d.surgeOptions.join(','));
  check('bandeiras padrao ordenadas', d.surgeOptions.every((v, i, a) => i === 0 || a[i - 1] <= v), d.surgeOptions.join(','));
  check('alternativas dentro do limite', d.alternatives >= 1 && d.alternatives <= 5, d.alternatives);
  check('ajuste na via ligado por padrao', d.snapToRoad === true);

  // storage vazio devolve o padrao e nao explode
  const st = SET.load();
  check('load() sem nada salvo devolve padrao', st.activeProfile === d.activeProfile);
  check('CFG nao foi alterado antes do apply', CFG.fare.profiles.custom === undefined);
}

/* ------------------------------------------------------------------ */
console.log('\nAplicacao no NAV_CONFIG');

{
  const { CFG, SET } = carregar('limpo');

  const st = SET.apply({
    activeProfile: 'custom',
    custom: { basePrice: 3, perKm: 1.5, perMinute: 0.3, minFare: 8, platformFeePercent: 0 },
    surgeOptions: [1, 1.3, 1.6],
    alternatives: 4,
    snapToRoad: false
  });

  const c = CFG.fare.profiles.custom;
  check('tabela "custom" injetada em CFG', !!c);
  check('valores personalizados aplicados', perto(c.perKm, 1.5) && perto(c.minFare, 8));
  check('taxa de intermediador 0 mantida', c.platformFeePercent === 0, c.platformFeePercent);
  check('activeProfile virou o padrao do CFG', CFG.fare.defaultProfile === 'custom', CFG.fare.defaultProfile);
  check('bandeiras aplicadas no CFG', CFG.fare.surgeOptions.join(',') === '1,1.3,1.6', CFG.fare.surgeOptions.join(','));
  check('alternativas aplicadas', CFG.alternatives === 4, CFG.alternatives);
  check('desligar ajuste na via zera snapMaxMeters', CFG.snapMaxMeters === 0, CFG.snapMaxMeters);

  // religar o ajuste precisa devolver o valor original do config
  const st2 = SET.apply(Object.assign({}, st, { snapToRoad: true }));
  check('religar ajuste na via restaura o valor', CFG.snapMaxMeters > 0, CFG.snapMaxMeters);

  // a tabela injetada precisa ser utilizavel pelo calculo de tarifa
  check('custom entra na lista de perfis', Object.keys(CFG.fare.profiles).indexOf('custom') !== -1,
    Object.keys(CFG.fare.profiles).join(','));
}

/* ------------------------------------------------------------------ */
console.log('\nValidacao de entrada do formulario');

{
  const { SET } = carregar('limpo');

  const comLixo = SET.sanitize({
    activeProfile: 'custom',
    custom: {
      basePrice: 'abc',
      perKm: '',
      perMinute: '1,90',
      minFare: NaN,
      platformFeePercent: -5,
      driverEmergencyPercent: 300,
      driverBonusPercent: 12.7
    },
    surgeOptions: 'nao-e-lista',
    alternatives: 'x'
  });

  check('texto solto vira o valor padrao', perto(comLixo.custom.basePrice, SET.padrao().custom.basePrice), comLixo.custom.basePrice);
  check('campo vazio vira o valor padrao', perto(comLixo.custom.perKm, SET.padrao().custom.perKm), comLixo.custom.perKm);
  check('NaN vira o valor padrao', perto(comLixo.custom.minFare, SET.padrao().custom.minFare), comLixo.custom.minFare);
  check('"1,90" com virgula e lido como 1,9', perto(comLixo.custom.perMinute, 1.9), comLixo.custom.perMinute);
  check('negativo e preso em 0', comLixo.custom.platformFeePercent === 0, comLixo.custom.platformFeePercent);
  check('acima de 100 e preso em 100', comLixo.custom.driverEmergencyPercent === 100, comLixo.custom.driverEmergencyPercent);
  check('decimal valido passa direto', perto(comLixo.custom.driverBonusPercent, 12.7), comLixo.custom.driverBonusPercent);
  check('surge invalido cai no padrao', comLixo.surgeOptions.indexOf(1) !== -1 && comLixo.surgeOptions.length > 0,
    comLixo.surgeOptions.join(','));
  check('alternativas invalidas caem no padrao', comLixo.alternatives >= 1 && comLixo.alternatives <= 5, comLixo.alternatives);

  check('null nao quebra', !!SET.sanitize(null));
  check('string solta nao quebra', !!SET.sanitize('abc'));
  check('array nao quebra', typeof SET.sanitize([1, 2, 3]).activeProfile === 'string',
    SET.sanitize([1, 2, 3]).activeProfile);
  check('objeto vazio devolve padrao', SET.sanitize({}).activeProfile === SET.padrao().activeProfile);

  // perfil salvo que sumiu do config
  const sumiu = SET.sanitize({ activeProfile: 'perfil-que-nao-existe' });
  check('perfil desconhecido volta pro padrao', sumiu.activeProfile === SET.padrao().activeProfile, sumiu.activeProfile);

  // limites
  const limites = SET.sanitize({ alternatives: 99 });
  check('alternativas 99 presas em 5', limites.alternatives === 5, limites.alternatives);
  const zero = SET.sanitize({ alternatives: 0 });
  check('alternativas 0 presas em 1', zero.alternatives === 1, zero.alternatives);
}

/* ------------------------------------------------------------------ */
console.log('\nTratamento das bandeiras');

{
  const { SET } = carregar('limpo');

  check('remove repetido', SET.listaSurge([1, 1.2, 1.2, 1.4], [1]).join(',') === '1,1.2,1.4',
    SET.listaSurge([1, 1.2, 1.2, 1.4], [1]).join(','));

  check('ordena crescente', SET.listaSurge([1.6, 1, 1.2], [1]).join(',') === '1,1.2,1.6',
    SET.listaSurge([1.6, 1, 1.2], [1]).join(','));

  check('arranca o valor 1 se faltar', SET.listaSurge([1.3, 1.6], [1]).indexOf(1) !== -1,
    SET.listaSurge([1.3, 1.6], [1]).join(','));

  check('arresta em 2 casas', SET.listaSurge([1.234], [1])[1] === 1.23, SET.listaSurge([1.234], [1]).join(','));

  check('descarta valores fora de 1 a 5', SET.listaSurge([1, 0.2, 9], [1]).join(',') === '1',
    SET.listaSurge([1, 0.2, 9], [1]).join(','));

  check('lista vazia volta ao padrao', SET.listaSurge([], [1, 1.2]).join(',') === '1,1.2',
    SET.listaSurge([], [1, 1.2]).join(','));

  check('texto com virgula e espaco e lido', SET.listaSurge('1, 1.2, 1.4', [1]).join(',') === '1,1.2,1.4',
    SET.listaSurge('1, 1.2, 1.4', [1]).join(','));
}

/* ------------------------------------------------------------------ */
console.log('\nPersistencia');

{
  const { SET, ls } = carregar('limpo');

  SET.save({ activeProfile: 'custom', custom: { perKm: 2.25, basePrice: 4 }, surgeOptions: [1, 2] });

  const st = SET.load();
  check('volta o que foi salvo', perto(st.custom.perKm, 2.25) && perto(st.custom.basePrice, 4),
    st.custom.perKm + ' / ' + st.custom.basePrice);
  check('bandeiras saldas voltam', st.surgeOptions.join(',') === '1,2', st.surgeOptions.join(','));
  check('gravou no localStorage', Object.keys(ls._dados).length > 0, Object.keys(ls._dados).join(','));

  // salvar de novo nao duplica nem corrompe
  SET.save(st);
  check('salvar duas vezes mantem o valor', perto(SET.load().custom.perKm, 2.25));

  SET.clear();
  check('reset limpa o storage', Object.keys(ls._dados).length === 0);
  check('reset devolve o padrao', SET.load().activeProfile === SET.padrao().activeProfile);
}

/* ------------------------------------------------------------------ */
console.log('\nStorage corrompido ou indisponivel');

{
  // JSON quebrado no localStorage
  const { SET: SET2, ls } = carregar('limpo');
  ls._dados[SET2.KEY] = '{isso nao e json';
  check('JSON corrompido nao quebra o app',
    SET2.load().activeProfile === SET2.padrao().activeProfile);
}

{
  // localStorage lance exception (modo privado / cota cheia)
  const { SET } = carregar('bloqueado');
  let quebrou = false;
  try {
    const st = SET.save({ activeProfile: 'custom', custom: { perKm: 9 } });
    if (st.custom.perKm !== 9) quebrou = true;
  } catch (e) {
    quebrou = true;
  }
  check('localStorage bloqueado nao quebra', !quebrou);
  check('e ainda assim devolve o estado valido', SET.load().activeProfile === SET.padrao().activeProfile);
}

/* ------------------------------------------------------------------ */
console.log('\nRecursos (ligar e desligar)');

{
  const { CFG, SET } = carregar('limpo');
  const d = SET.padrao();

  check('padrao: tarifa desligada', d.showFare === false);
  check('padrao: rota automatica ligada', d.autoRoute === true);
  check('padrao: instrucoes ligadas', d.showSteps === true);
  check('padrao: ajuste na via ligado', d.snapToRoad === true);

  // desligar tudo
  const off = SET.sanitize({
    showFare: false, autoRoute: false, showSteps: false, snapToRoad: false
  });
  check('desligar tudo e preservado', off.showFare === false && off.autoRoute === false &&
    off.showSteps === false && off.snapToRoad === false);

  // ligar tudo
  const on = SET.sanitize({
    showFare: true, autoRoute: true, showSteps: true, snapToRoad: true
  });
  check('ligar tudo e preservado', on.showFare === true && on.autoRoute === true &&
    on.showSteps === true && on.snapToRoad === true);

  // salvo e volta
  SET.save({ showFare: true, autoRoute: false, showSteps: false, snapToRoad: false });
  const volta = SET.load();
  check('recursos voltam do storage', volta.showFare === true && volta.autoRoute === false &&
    volta.showSteps === false && volta.snapToRoad === false,
    JSON.stringify([volta.showFare, volta.autoRoute, volta.showSteps, volta.snapToRoad]));

  // o apply precisa refletir o snap no CFG
  SET.apply(volta);
  check('snap desligado zera snapMaxMeters', CFG.snapMaxMeters === 0, CFG.snapMaxMeters);
  SET.apply(SET.padrao());
  check('snap ligado restaura snapMaxMeters', CFG.snapMaxMeters > 0, CFG.snapMaxMeters);

  // valores nao-booleanos voltam ao padrao em vez de virar lixo
  const lixo = SET.sanitize({ showFare: 'sim', autoRoute: 0, showSteps: null });
  check('"sim" volta ao padrao (false)', lixo.showFare === d.showFare, lixo.showFare);
  check('0 volta ao padrao (true)', lixo.autoRoute === d.autoRoute, lixo.autoRoute);
  check('null volta ao padrao', lixo.showSteps === d.showSteps, lixo.showSteps);

  // string "true"/"false" (veio de um JSON antigo) e aceita
  const str = SET.sanitize({ showFare: 'true', autoRoute: 'false' });
  check('string "true" vira true', str.showFare === true);
  check('string "false" vira false', str.autoRoute === false);
}

/* ------------------------------------------------------------------ */
console.log('\nCamera da navegacao (navZoom / navOffsetY)');

{
  const { CFG, SET } = carregar('limpo');
  const d = SET.padrao();

  check('padrao: zoom 18', d.navZoom === 18, d.navZoom);
  check('padrao: offset 0 (centro exato)', d.navOffsetY === 0, d.navOffsetY);

  // limites presos na faixa do formulario
  check('navZoom 99 preso em 19', SET.sanitize({ navZoom: 99 }).navZoom === 19,
    SET.sanitize({ navZoom: 99 }).navZoom);
  check('navZoom 10 preso em 17', SET.sanitize({ navZoom: 10 }).navZoom === 17,
    SET.sanitize({ navZoom: 10 }).navZoom);
  check('navZoom valido passa', SET.sanitize({ navZoom: 17 }).navZoom === 17);
  check('navZoom lixo volta ao padrao', SET.sanitize({ navZoom: 'x' }).navZoom === d.navZoom);
  check('navOffsetY 999 preso em 220', SET.sanitize({ navOffsetY: 999 }).navOffsetY === 220,
    SET.sanitize({ navOffsetY: 999 }).navOffsetY);
  check('navOffsetY negativo preso em 0', SET.sanitize({ navOffsetY: -40 }).navOffsetY === 0);
  check('navOffsetY valido passa', SET.sanitize({ navOffsetY: 120 }).navOffsetY === 120);
  check('navOffsetY lixo volta ao padrao', SET.sanitize({ navOffsetY: {} }).navOffsetY === d.navOffsetY);

  // roundtrip de save/load
  SET.save({ navZoom: 19, navOffsetY: 150 });
  const volta = SET.load();
  check('navZoom/navOffsetY voltam do storage', volta.navZoom === 19 && volta.navOffsetY === 150,
    volta.navZoom + '/' + volta.navOffsetY);

  // apply reflete no CFG (e o padrao devolve 18/0)
  SET.apply(volta);
  check('apply escreve navZoom no CFG', CFG.navZoom === 19, CFG.navZoom);
  check('apply escreve navOffsetY no CFG', CFG.navOffsetY === 150, CFG.navOffsetY);
  SET.apply(SET.padrao());
  check('apply do padrao restaura 18/0', CFG.navZoom === 18 && CFG.navOffsetY === 0,
    CFG.navZoom + '/' + CFG.navOffsetY);
}

/* ------------------------------------------------------------------ */
console.log('\n' + (falhas === 0
  ? '>>> Tudo passou.'
  : '>>> ' + falhas + ' verificacao(oes) falharam.') + '\n');

process.exit(falhas === 0 ? 0 : 1);