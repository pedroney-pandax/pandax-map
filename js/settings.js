/* Persistencia das configuracoes da engrenagem.

   Tudo que o usuario ajusta na tela de configuracoes passa por aqui:
   le do localStorage, valida campo a campo e escreve no NAV_CONFIG.
   O app le sempre do NAV_CONFIG, entao nao existe estado duplicado.

   Motivo de validar tudo: os campos sao inputs de texto livres. Se o
   usuario apagar o numero do meio, digitar letra ou colar "1,90", o
   valor tem que virar um numero sensato -- nunca NaN quebrando a tela. */

(function () {
  'use strict';

  var CFG = window.NAV_CONFIG;
  var KEY = 'pandax.settings.v1';

  // Guarda o valor original para conseguir voltar quando o usuario
  // desliga o "ajustar na via".
  var SNAP_ORIGINAL = CFG.snapMaxMeters;

  var ouvintes = [];

  /* ------------------------------------------------------------------ *
   * Leitura / validacao
   * ------------------------------------------------------------------ */

  // Aceita "1,90" e "1.90" e number. Preso em [min, max].
  function num(v, padrao, min, max) {
    var n = (typeof v === 'number') ? v : parseFloat(String(v).replace(',', '.'));
    if (!isFinite(n)) return padrao;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  }

  // Bandeiras: o que estiver fora de 1 a 5 e DESCARTADO, nao preso.
  // Preservar 9 como "9x" seria pior que ignorar: ninguem quer uma
  // bandeira de 900% e o usuario provavelmente digitou por engano.
  function listaSurge(v, padrao) {
    var base0 = (padrao && padrao.length) ? padrao.slice() : [1];

    // aceita "1, 1.2, 1.4" alem de [1, 1.2, 1.4]
    var itens = v;
    if (typeof itens === 'string') itens = itens.split(/[,\s]+/);
    if (!Array.isArray(itens)) return base0;

    var out = [];
    itens.forEach(function (x) {
      var n = (typeof x === 'number') ? x : parseFloat(String(x).replace(',', '.'));
      if (!isFinite(n)) return;
      if (n < 1 || n > 5) return;
      // 2 casas: bandeira de 1,333 nao faz sentido
      out.push(Math.round(n * 100) / 100);
    });

    // remove repetido, mantem a ordem
    out = out.filter(function (x, i) { return out.indexOf(x) === i; });

    // sem nada utilizavel: volta ao padrao inteiro, em vez de criar
    // uma lista so com o valor 1 e perder as opcoes que existiam
    if (!out.length) return base0;

    // a bandeira normal e obrigatoria
    if (!out.some(function (x) { return x === 1; })) out.unshift(1);

    return out.sort(function (a, b) { return a - b; });
  }

  /* "custom" e sempre valido: e o perfil que apply() cria antes de
     validar, entao ainda nao existe em CFG.fare.profiles neste ponto. */
  function perfilExiste(key) {
    return key === 'custom' || !!CFG.fare.profiles[key];
  }

  function base() {
    var f = CFG.fare;
    var ref = f.profiles[f.defaultProfile] || f.profiles.direto;
    return {
      // recursos ligavel/desligavel
      showFare: false,       // mostrar a estimativa de tarifa no resultado
      autoRoute: true,       // calcular a rota sozinho ao escolher os dois pontos
      showSteps: true,       // mostrar a lista de instrucoes
      snapToRoad: true,      // ajustar o ponto na rua mais proxima
      advancedFields: false, // mostrar os campos manuais de origem e destino

      // Navegacao: zoom da aproximacao ao entrar na rota (fixo em 18 antes)
      // e o quanto o carro desce da central da tela, deixando mais estrada
      // a frente. 0 = carro exatamente no centro.
      navZoom: 18,
      navOffsetY: 0,

      activeProfile: f.defaultProfile,
      custom: {
        label: 'Personalizada',
        note: 'definida por voce',
        basePrice: ref.basePrice,
        perKm: ref.perKm,
        perMinute: ref.perMinute,
        minFare: ref.minFare,
        platformFeePercent: ref.platformFeePercent,
        driverEmergencyPercent: ref.driverEmergencyPercent,
        driverBonusPercent: ref.driverBonusPercent
      },
      surgeOptions: f.surgeOptions.slice(),
      alternatives: CFG.alternatives,
      geoapifyKey: ''
    };
  }

  /* Chave de API: texto livre, mas corta e limpa. Nada de validar formato
     porque o app nao pode rejeitar uma chave valida por um regex errado -
     a API e quem responde, e o fallback ja engole o erro. */
  function apiKey(v) {
    return typeof v === 'string'
      ? v.trim().replace(/\s+/g, '').slice(0, 120)
      : '';
  }

  // chaves booleanas: tudo que nao for false explicito fica ligado
  var BOOL_KEYS = ['showFare', 'autoRoute', 'showSteps', 'snapToRoad', 'advancedFields'];

  function booleano(v, padrao) {
    if (v === true || v === false) return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return padrao;
  }

  /* Normaliza qualquer objeto (inclusive vindo do localStorage corrompido
     ou de uma versao antiga do app) para um estado sempre utilizavel. */
  function sanitize(bruto) {
    var d = base();
    if (!bruto || typeof bruto !== 'object') return d;

    var c = bruto.custom || {};

    var st = {
      showFare: booleano(bruto.showFare, d.showFare),
      autoRoute: booleano(bruto.autoRoute, d.autoRoute),
      showSteps: booleano(bruto.showSteps, d.showSteps),
      snapToRoad: booleano(bruto.snapToRoad, d.snapToRoad),
      advancedFields: booleano(bruto.advancedFields, d.advancedFields),

      navZoom: Math.round(num(bruto.navZoom, d.navZoom, 17, 19)),
      navOffsetY: Math.round(num(bruto.navOffsetY, d.navOffsetY, 0, 220)),

      activeProfile: typeof bruto.activeProfile === 'string' ? bruto.activeProfile : d.activeProfile,
      custom: {
        label: typeof c.label === 'string' && c.label.trim() ? c.label.trim().slice(0, 40) : d.custom.label,
        note: typeof c.note === 'string' ? c.note.trim().slice(0, 60) : d.custom.note,
        basePrice: num(c.basePrice, d.custom.basePrice, 0, 999),
        perKm: num(c.perKm, d.custom.perKm, 0, 99),
        perMinute: num(c.perMinute, d.custom.perMinute, 0, 99),
        minFare: num(c.minFare, d.custom.minFare, 0, 999),
        platformFeePercent: num(c.platformFeePercent, d.custom.platformFeePercent, 0, 100),
        driverEmergencyPercent: num(c.driverEmergencyPercent, d.custom.driverEmergencyPercent, 0, 100),
        driverBonusPercent: num(c.driverBonusPercent, d.custom.driverBonusPercent, 0, 100)
      },
      surgeOptions: listaSurge(bruto.surgeOptions, d.surgeOptions),
      alternatives: Math.round(num(bruto.alternatives, d.alternatives, 1, 5)),
      geoapifyKey: apiKey(bruto.geoapifyKey)
    };

    // perfil salvo pode ter sumido do config numa versao futura
    if (!perfilExiste(st.activeProfile)) st.activeProfile = d.activeProfile;

    return st;
  }

  function load() {
    var bruto = null;
    try {
      var txt = localStorage.getItem(KEY);
      if (txt) bruto = JSON.parse(txt);
    } catch (e) {
      // localStorage bloqueado (modo privado) ou JSON quebrado:
      // seguimos com o padrao em vez de travar o app
      bruto = null;
    }
    return sanitize(bruto);
  }

  function save(estado) {
    var st = sanitize(estado);
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {
      // sem espaco ou sem permissao: a config vale so nesta sessao
    }
    return st;
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    return base();
  }

  /* ------------------------------------------------------------------ *
   * Aplicacao no NAV_CONFIG
   * ------------------------------------------------------------------ */

  /* Escreve o estado validado no CFG. A tabela "custom" e injetada em
     fare.profiles, e por isso que ela aparece sozinha nos chips e na
     estimativa sem ninguem precisar tratar esse caso especial la embaixo. */
  function apply(estado) {
    var st = sanitize(estado);
    var f = CFG.fare;
    var c = st.custom;

    f.profiles.custom = {
      label: c.label,
      note: c.note,
      basePrice: c.basePrice,
      perKm: c.perKm,
      perMinute: c.perMinute,
      minFare: c.minFare,
      platformFeePercent: c.platformFeePercent,
      driverEmergencyPercent: c.driverEmergencyPercent,
      driverBonusPercent: c.driverBonusPercent
    };

    f.defaultProfile = st.activeProfile;
    f.surgeOptions = st.surgeOptions;
    CFG.alternatives = st.alternatives;

    // 0 = nao ajusta o ponto em via nenhuma
    CFG.snapMaxMeters = st.snapToRoad ? SNAP_ORIGINAL : 0;

    // navegacao: o app le daqui (assim como de alternatives acima)
    CFG.navZoom = st.navZoom;
    CFG.navOffsetY = st.navOffsetY;

    return st;
  }

  function onChange(fn) {
    ouvintes.push(fn);
  }

  function emit(estado) {
    ouvintes.forEach(function (fn) {
      try { fn(estado); } catch (e) { console.error(e); }
    });
  }

  window.NAV_SETTINGS = {
    KEY: KEY,
    padrao: base,
    sanitize: sanitize,
    load: load,
    save: save,
    clear: clear,
    apply: apply,
    onChange: onChange,
    emit: emit,
    num: num,
    listaSurge: listaSurge
  };

})();