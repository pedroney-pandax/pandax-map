/* Camada de UI: mapa, marcadores, busca, calculo e exibicao da rota. */

(function () {
  'use strict';

  var CFG = window.NAV_CONFIG;
  var SVC = window.NAV_SERVICES;
  var SET = window.NAV_SETTINGS;
  var NAV = window.NAV_NAV;
  var PRECOS = window.NAV_PRECOS;

  // Se o Leaflet nao carregou, nao adianta tentar montar o mapa:
  // mostra o motivo na tela em vez de deixar um retangulo vazio.
  if (typeof L === 'undefined') {
    var mapaVazio = document.getElementById('map');
    if (mapaVazio) {
      mapaVazio.innerHTML =
        '<div class="fatal">' +
        '<strong>O Leaflet nao carregou.</strong>' +
        '<p>Verifique se o arquivo existe em <code>vendor/leaflet/leaflet.js</code> ' +
        'e se voce esta acessando pelo servidor (<code>npm start</code>), ' +
        'nao abrindo o arquivo direto.</p>' +
        '</div>';
    }
    return;
  }

  var el = {
    map: document.getElementById('map'),
    origin: document.getElementById('input-origin'),
    destination: document.getElementById('input-destination'),
    suggestions: document.getElementById('suggestions'),
    hint: document.getElementById('hint'),
    error: document.getElementById('error'),
    summary: document.getElementById('summary'),
    steps: document.getElementById('steps'),
    routesSection: document.getElementById('routes-section'),
    routeChips: document.getElementById('route-chips'),
    stepsSection: document.getElementById('steps-section'),
    emptyNote: document.getElementById('empty-note'),
    btnRoute: document.getElementById('btn-route'),
    btnSwap: document.getElementById('btn-swap'),
    btnClear: document.getElementById('btn-clear'),
    btnLocateMe: document.getElementById('btn-locate-me'),
    btnFare: document.getElementById('btn-fare'),
    fareOpts: document.getElementById('fare-opts'),
    profileChips: document.getElementById('profile-chips'),
    surgeChips: document.getElementById('surge-chips'),
    panel: document.getElementById('panel'),

    // navegacao por manobras
    navSection: document.getElementById('nav-section'),
    navChoice: document.getElementById('nav-choice'),
    navExternal: document.getElementById('nav-external'),
    navStart: document.getElementById('nav-start'),
    navHud: document.getElementById('nav-hud'),
    navHudIcon: document.getElementById('nav-hud-icon'),
    navHudText: document.getElementById('nav-hud-text'),
    navHudStreet: document.getElementById('nav-hud-street'),
    navHudDist: document.getElementById('nav-hud-dist'),
    navHudRemain: document.getElementById('nav-hud-remain'),
    navBar: document.getElementById('nav-bar'),
    navSpeedVal: document.getElementById('nav-speed-val'),
    navBarEta: document.getElementById('nav-bar-eta'),
    navMute: document.getElementById('nav-mute'),
    navMenu: document.getElementById('nav-menu'),
    navStop: document.getElementById('nav-stop'),
    navCancel: document.getElementById('nav-cancel'),
    navMsg: document.getElementById('nav-msg'),
    gpsStatus: document.getElementById('gps-status'),

    // painel de configuracoes
    btnSettings: document.getElementById('btn-settings'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsOverlay: document.getElementById('settings-overlay'),
    btnSettingsClose: document.getElementById('btn-settings-close'),
    btnSettingsDone: document.getElementById('btn-settings-done'),
    btnSettingsReset: document.getElementById('btn-settings-reset'),
    setProfileChips: document.getElementById('settings-profile-chips'),
    setCustom: document.getElementById('settings-custom'),
    setPreview: document.getElementById('settings-preview'),
    setSurge: document.getElementById('set-surgeOptions'),
    setAlternatives: document.getElementById('set-alternatives'),
    setNavZoom: document.getElementById('set-navZoom'),
    setNavOffsetY: document.getElementById('set-navOffsetY'),
    setGeoapifyKey: document.getElementById('set-geoapifyKey'),
    tileAviso: document.getElementById('tile-aviso'),
    setSnap: document.getElementById('set-snapToRoad'),
    setShowFare: document.getElementById('set-showFare'),
    setShowSteps: document.getElementById('set-showSteps'),
    setAutoRoute: document.getElementById('set-autoRoute'),
    setAdvancedFields: document.getElementById('set-advancedFields'),
    setLabel: document.getElementById('set-label'),
    btnWhere: document.getElementById('btn-where'),
    searchScreen: document.getElementById('search-screen'),
    searchInput: document.getElementById('search-input'),
    searchBack: document.getElementById('search-back'),
    searchClear: document.getElementById('search-clear'),
    searchSuggest: document.getElementById('search-suggest'),
    btnWhereFloat: document.getElementById('btn-where-float'),
    btnPanel: document.getElementById('btn-panel'),
    btnPanelClose: document.getElementById('btn-panel-close'),
    btnTheme: document.getElementById('btn-theme'),

    // seletor "olho": o que mostrar no mapa (postos e, depois, outras)
    btnEye: document.getElementById('btn-eye'),
    camadasPanel: document.getElementById('camadas-panel'),
    camadasClose: document.getElementById('camadas-close'),
    camadaPostos: document.getElementById('camada-postos'),
    camadaPostosInfo: document.getElementById('camada-postos-info'),
    camadaFonte: document.getElementById('camada-fonte'),
    camadaPostosVisao: document.getElementById('camada-postos-visao'),
    postosVisaoPerto: document.getElementById('postos-visao-perto'),
    postosVisaoTodos: document.getElementById('postos-visao-todos'),

    // radares e semaforos
    camadaRadares: document.getElementById('camada-radares'),
    camadaSemaforos: document.getElementById('camada-semaforos'),
    camadaRadaresInfo: document.getElementById('camada-radares-info'),
    camadaSemaforosInfo: document.getElementById('camada-semaforos-info'),


    // tipo de mapa (base): botao logo abaixo do olho
    btnBasemap: document.getElementById('btn-basemap'),
    basemapPanel: document.getElementById('basemap-panel'),
    basemapClose: document.getElementById('basemap-close'),
    basemapList: document.getElementById('basemap-list'),

    postoPerto: document.getElementById('posto-perto'),
    postoEdit: document.getElementById('posto-edit'),
    postoEditNome: document.getElementById('posto-edit-nome'),
    postoEditEnd: document.getElementById('posto-edit-end'),
    postoEditCampos: document.getElementById('posto-edit-campos'),
    postoEditClose: document.getElementById('posto-edit-close'),
    postoEditCancelar: document.getElementById('posto-edit-cancelar'),
    postoEditSalvar: document.getElementById('posto-edit-salvar'),

    // favoritos: botao no canto, lista que abre acima dele e o perguntar
    // da chegada (o botao em si some durante a navegacao)
    btnFav: document.getElementById('btn-fav'),
    favList: document.getElementById('fav-list'),
    favAsk: document.getElementById('fav-ask'),
    favAskSim: document.getElementById('fav-ask-sim'),
    favAskNao: document.getElementById('fav-ask-nao')
  };
  var searchFieldTarget = null;
  var searchSeq2 = 0;

  /* ------------------------------------------------------------------ *
   * Tema dia/noite (tons de roxo)
   * ------------------------------------------------------------------ */

  var TEMA_CHAVE = 'pandax.tema';

  function temaSalvo() {
    try { return localStorage.getItem(TEMA_CHAVE) === 'noite' ? 'noite' : 'dia'; }
    catch (e) { return 'dia'; }
  }

  // Le uma variavel de cor do tema atual (dia/noite) para usar no Leaflet,
  // que nao entende CSS: as linhas de rota precisam do valor literal.
  function corVar(nome, padrao) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(nome);
    v = (v || '').trim();
    return v || padrao;
  }

  function aplicarTema(t) {
    var noite = (t === 'noite');
    if (noite) document.documentElement.setAttribute('data-theme', 'night');
    else document.documentElement.removeAttribute('data-theme');
    if (el.btnTheme) {
      el.btnTheme.textContent = noite ? 'Dia' : 'Noite';
      var rotulo = noite ? 'Mudar para o tema dia' : 'Mudar para o tema noite';
      el.btnTheme.setAttribute('aria-label', rotulo);
      el.btnTheme.title = rotulo;
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', noite ? '#120d1f' : '#6d28d9');
    recolorirMapa();
  }

  function alternarTema() {
    var novo = (document.documentElement.getAttribute('data-theme') === 'night') ? 'dia' : 'noite';
    try { localStorage.setItem(TEMA_CHAVE, novo); } catch (e) {}
    aplicarTema(novo);
  }

  // Reaplica as cores do tema nas camadas do Leaflet ja desenhadas.
  function recolorirMapa() {
    if (!map) return;
    var rota = corVar('--route', '#7c3aed');
    var casca = corVar('--route-casing', '#3b0764');
    var inativaCasca = corVar('--ink-soft', '#4b5563');
    var inativaLinha = corVar('--ink-faint', '#8b95a5');
    var carro = corVar('--car', '#2563eb');

    state.routes.forEach(function (route, i) {
      var active = (i === state.active);
      var c = state.layers[2 * i];
      var l = state.layers[2 * i + 1];
      if (c) c.setStyle({ color: active ? casca : inativaCasca });
      if (l) l.setStyle({ color: active ? rota : inativaLinha });
    });
    if (state.nav.percursoHalo) state.nav.percursoHalo.setStyle({ color: casca });
    if (state.nav.percurso) state.nav.percurso.setStyle({ color: rota });
    if (meCircle) meCircle.setStyle({ color: carro, fillColor: carro });
  }

  function openSearchScreen(field) {
    searchFieldTarget = field;
    el.searchInput.value = '';
    if (field === 'origin' && state.origin) {
      el.searchInput.value = state.origin.label || '';
    }
    if (field === 'destination' && state.destination) {
      el.searchInput.value = state.destination.label || '';
    } else if (field === 'destination' && !state.origin) {
      // se ainda nao tem origem, podemos deixar o destino em foco
    }
    el.searchClear.classList.toggle('hidden', !el.searchInput.value.trim());
    el.searchScreen.classList.remove('hidden');
    setTimeout(function () { el.searchInput.focus(); }, 50);
    el.searchSuggest.innerHTML = '';
  }
  function closeSearchScreen() {
    el.searchScreen.classList.add('hidden');
    searchFieldTarget = null;
    hideSuggestions();
  }

  /* Folha inferior (rotas/detalhes). Fechada = mapa em tela cheia. */
  function abrirPainel() {
    if (!el.panel) return;
    el.panel.classList.remove('panel--closed');
    if (el.btnPanel) el.btnPanel.setAttribute('aria-expanded', 'true');
    if (el.navMenu) el.navMenu.setAttribute('aria-expanded', 'true');
  }
  function fecharPainel() {
    if (!el.panel) return;
    el.panel.classList.add('panel--closed');
    if (el.btnPanel) el.btnPanel.setAttribute('aria-expanded', 'false');
    if (el.navMenu) el.navMenu.setAttribute('aria-expanded', 'false');
  }
  function alternarPainel() {
    if (!el.panel) return;
    if (el.panel.classList.contains('panel--closed')) abrirPainel();
    else fecharPainel();
  }
  function renderSearchItems(items) {
    if (!items.length) { el.searchSuggest.innerHTML = ''; return; }
    el.searchSuggest.innerHTML = items.map(function (it, i) {
      return '<button type="button" class="search-item" data-index="' + i + '">' + esc(it.label) + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.searchSuggest.querySelectorAll('.search-item'), function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-index'));
        var chosen = items[idx];
        if (searchFieldTarget) {
          applyPlace(searchFieldTarget, chosen);
        } else {
          if (state.destination) applyPlace('origin', chosen);
          else applyPlace('destination', chosen);
        }
        closeSearchScreen();
      });
    });
  }

  // Busca da tela cheia ("Para onde?"). Separada da busca do painel porque
  // tem a propria sequencia (searchSeq2) e o proprio alvo (searchFieldTarget).
  function runSearchScreen(query) {
    var seq = ++searchSeq2;
    var opts = {
      geoapifyKey: (state.settings && state.settings.geoapifyKey) || '',
      // O Photon responde rapido; Overpass/Nominatim enriquecem depois.
      // Sem isso a lista ficava varios segundos com o resultado da busca
      // anterior enquanto a Overpass (instavel) nao respondia.
      onUpdate: function (items) {
        if (seq !== searchSeq2) return; // resposta obsoleta
        renderSearchItems(items);
      }
    };
    // limpa a lista antiga: durante a espera o texto digitado ja e outro
    el.searchSuggest.innerHTML = '';
    SVC.searchPlaces(query, 8, opts).then(function (items) {
      if (seq !== searchSeq2) return; // resposta obsoleta
      renderSearchItems(items);
    }).catch(function (err) {
      if (seq !== searchSeq2) return;
      el.searchSuggest.innerHTML = '';
      showError('Falha na busca: ' + err.message);
    });
  }

  if (el.searchInput) {
    el.searchInput.addEventListener('input', function () {
      var q = el.searchInput.value;
      el.searchClear.classList.toggle('hidden', !q.trim());
      clearTimeout(searchTimer);
      if (q.trim().length < 3) { el.searchSuggest.innerHTML = ''; return; }
      searchTimer = setTimeout(function () { runSearchScreen(q); }, CFG.searchDebounceMs);
    });
    el.searchInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); closeSearchScreen(); }
    });
  }
  if (el.searchBack) el.searchBack.addEventListener('click', closeSearchScreen);
  if (el.searchClear) {
    el.searchClear.addEventListener('click', function () {
      el.searchInput.value = '';
      el.searchClear.classList.add('hidden');
      el.searchSuggest.innerHTML = '';
      el.searchInput.focus();
    });
  }
  
  // campos numericos da tarifa personalizada: id -> chave
  var SET_NUM = ['basePrice', 'perKm', 'perMinute', 'minFare',
    'platformFeePercent', 'driverEmergencyPercent', 'driverBonusPercent'];

  // chaves booleanas dos recursos (id do input = nome da chave)
  var SET_BOOL = {
    setShowFare: 'showFare',
    setShowSteps: 'showSteps',
    setAutoRoute: 'autoRoute',
    setSnap: 'snapToRoad',
    setAdvancedFields: 'advancedFields'
  };

  // Campos manuais de origem/destino: ficam escondidos no fluxo "Para onde?"
  // e so aparecem quando o usuario liga o modo avancado nas configuracoes.
  var camposAvancados = document.querySelector('.fields');

  var state = {
    origin: null,
    destination: null,
    picking: null,
    routes: [],
    active: 0,
    layers: [],
    markerLayer: null,
    showFare: false,
    surge: CFG.fare.surgeOptions[0],
    profile: CFG.fare.defaultProfile,
    settings: null,
    settingsOpen: false,

    /* Localizacao em segundo plano: alimenta o retangulo de setor/bairro
       mesmo quando nao ha rota ativa. */
    geo: {
      watchId: null,     // watchPosition proprio do app (fora da navegacao)
      bairro: null,      // setor/bairro atual ("voce esta em Setor Bueno")
      bairroPos: null,   // ultima coordenada consultada
      bairroMs: 0,       // quando consultou (evita bater o Nominatim)
      bairroPendente: false,
      ultima: null,      // ultima posicao lida (para filtrar os postos perto)
      centralizado: false // ja levou o mapa para a posicao na primeira leitura
    },

    /* Postos de gasolina: base embutida (data/postos-goiania.json) e o
       estado da camada do seletor "olho". */
    postos: {
      lista: [],        // postos carregados do arquivo
      pedido: null,     // fetch em andamento (carrega uma vez so)
      camada: null,     // grupo Leaflet com os marcadores
      ligada: false,    // interruptor da categoria ligado
      watchId: null,    // GPS proprio quando nao ha navegacao ativa
      ultimo: null,     // ultima posicao avaliada (evita recontar a toa)
      perto: null,      // posto do quadro "chegando perto"
      pertoDist: 0,     // distancia (m) do quadro, para re-render apos editar
      editando: null,   // posto aberto no editor de precos
      visao: 'perto',   // 'perto' (2 km) ou 'todos': quais pinos desenhar
      centro: null      // coordenada usada no filtro 'perto'
    },

    radares: {
      lista: [],
      pedido: null,
      camada: null,
      ligada: false
    },
    semaforos: {
      lista: [],
      pedido: null,
      camada: null,
      ligada: false
    },


    /* Navegacao por manobras. Os campos ficam todos aqui para dar para
       pausar, depurar e resetar de um lugar so. */
    nav: {
      ativo: false,
      prep: null,        // rota preparada (cumulativos + passos na mesma regua)
      falados: {},       // indice da manobra ja anunciada pela voz
      mudo: false,
      chegou: false,
      offDesde: 0,       // quando comecou a estar fora da rota (ms)
      ultimoReplan: 0,   // ultima vez que recalculou sozinho (ms)
      ultimaPos: null,
      seguir: false,     // camera acompanha o usuario (so durante a navegacao)
      ponte: null,
      avisoLigado: false, // ja escutou os avisos do aparelho (evita duplicar)
      autoIniciar: false, // destino escolhido na busca: comeca a navegar sozinho
      meDir: null,       // rumo acumulado do carrinho (graus, gira pelo curto)
      zoomado: false,    // ja aproximou o zoom na primeira posicao
      percursoHalo: null, // casca do trecho que ainda falta percorrer
      percurso: null,     // trecho que ainda falta percorrer
      manobra: null,      // marcador de "vire aqui" no mapa
      posLigado: false,  // ja escutou as posicoes do aparelho (evita duplicar)
      girando: false,    // laco de giro do mapa (heading-up) ligado
      bAlvo: 0,          // rumo alvo do mapa (graus)
      bAtual: 0          // rumo atual do mapa (graus, suavizado)
    }
  };

  /* ------------------------------------------------------------------ *
   * Helpers de DOM e formatacao
   * ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtKm(km) {
    if (km == null) return '--';
    if (km < 1) return Math.round(km * 1000) + ' m';
    return km.toFixed(km < 10 ? 1 : 0).replace('.', ',') + ' km';
  }

  function fmtMin(sec) {
    if (sec == null) return '--';
    var total = Math.round(sec / 60);
    var h = Math.floor(total / 60);
    var m = total % 60;
    if (h <= 0) return m + ' min';
    return h + ' h ' + (m > 0 ? m + ' min' : '');
  }

  /* Real brasileiro: 1234.5 -> "R$ 1.234,50" */
  var brlFmt = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  });

  function brl(v) {
    if (v == null || isNaN(v)) return '--';
    return brlFmt.format(v);
  }

  function surgeLabel(s) {
    if (s === 1) return 'Normal';
    if (s < 1.3) return 'Alta';
    if (s < 1.5) return 'Muito alta';
    return 'Extrema';
  }

  function showError(msg) {
    el.error.textContent = msg;
    el.error.classList.remove('hidden');
  }

  function clearError() {
    el.error.textContent = '';
    el.error.classList.add('hidden');
  }

  function setHint(msg) {
    if (!msg) {
      el.hint.classList.add('hidden');
      return;
    }
    el.hint.innerHTML = msg;
    el.hint.classList.remove('hidden');
  }

  /* Aviso de tiles: quando o provedor de mapa base cai, o Leaflet só
     deixa o fundo cinza e nao fala nada. Isso aqui explica o que houve
     e oferece trocar de base. some sozinho depois de uns 12 s. */
  var avisoTimer = null;

  function mostrarAvisoTiles(quantos) {
    if (!el.tileAviso) return;
    el.tileAviso.textContent = 'Nao foi possivel baixar alguns mapas. ' +
      'Verifique a conexao ou troque o mapa base no botao de mapa, logo abaixo do olho.';
    el.tileAviso.classList.remove('hidden');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () {
      el.tileAviso.classList.add('hidden');
    }, 12000);
  }

  /* ------------------------------------------------------------------ *
   * Mapa
   * ------------------------------------------------------------------ */

  var map = L.map(el.map, {
    center: [CFG.center.lat, CFG.center.lon],
    zoom: CFG.defaultZoom,
    // controle proprio no canto inferior direito: o padrao do Leaflet
    // fica no topo e atrapalha o seletor de mapa base
    zoomControl: false,
    tap: true,
    // canvas em vez de SVG: rota longa com muitos pontos fica leve
    preferCanvas: true,
    zoomAnimation: true,
    fadeAnimation: true,
    // giro do mapa (heading-up) na navegacao: o plugin leaflet-rotate usa
    // esta opcao para montar as camadas que giram junto com o mundo.
    rotate: true,
    // nao deixa arrastar para o oceano e voltar para a direita
    worldCopyJump: true,
    maxBounds: [[CFG.bounds.minLat - 1, CFG.bounds.minLon - 1],
                [CFG.bounds.maxLat + 1, CFG.bounds.maxLon + 1]],
    maxBoundsViscosity: 0.7
  });

  // Camadas de mapa: todas declaradas em config.js viram opcoes no seletor.
  // O padrao e a primeira da lista (ou a ultima escolhida, guardada no
  // aparelho). O seletor nao e o do Leaflet: aquele nascia no canto superior
  // direito, dentro do empilhamento do mapa, e a topbar flutuante passava
  // por cima -- o botao de zoom chegou a ficar 100% inalcancavel. Agora o
  // tipo de mapa mora no botao logo abaixo do olho (ver CSS .map-base-btn).
  var CHAVE_BASEMAP = 'pandax.basemap.v1';
  var baseKeys = Object.keys(CFG.basemaps);
  var baseLayers = {};

  // tiles que falharam: se o provedor cair, o mapa fica cinza sem aviso.
  // Contamos para avisar em vez de deixar o usuario sem entender nada.
  var tileErros = 0;
  var tileAvisoTimer = null;

  baseKeys.forEach(function (key) {
    var cfg = CFG.basemaps[key];
    var layer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom || 19,
      crossOrigin: true,
      // buffer de tiles maior = menos "buraco" ao arrastar rapido
      updateWhenIdle: true,
      keepBuffer: 4
    });

    layer.on('tileerror', function () {
      tileErros++;
      if (tileErros < 12 || tileAvisoTimer) return;
      tileAvisoTimer = setTimeout(function () {
        tileAvisoTimer = null;
        mostrarAvisoTiles(tileErros);
      }, 6000);
    });

    layer.on('tileload', function () { tileErros = 0; });

    baseLayers[key] = layer;
  });

  // A ultima escolha vale na proxima abertura; se nunca escolheu nada (ou a
  // chave veio lixo), vale a primeira da lista.
  var baseAtual = baseKeys[0];
  try {
    var salvo = window.localStorage.getItem(CHAVE_BASEMAP);
    if (salvo && baseLayers[salvo]) baseAtual = salvo;
  } catch (e) { /* storage bloqueado: fica no padrao */ }

  baseLayers[baseAtual].addTo(map);

  map.whenReady(function () {
    setTimeout(function () {
      if (tileErros >= 12) mostrarAvisoTiles(tileErros);
    }, 4000);
  });

  // Canto superior direito: o inferior direito agora e do botao da folha.
  // O zoom fica logo abaixo da topbar flutuante (CSS main.map-wrap
  // .leaflet-right), que cobria ele inteiro. O seletor de tipo de mapa nao
  // esta mais aqui: virou o botao abaixo do olho.
  L.control.zoom({ position: 'topright' }).addTo(map);

  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  function pinIcon(letter, kind) {
    return L.divIcon({
      className: 'pin-wrap',
      html: '<div class="pin pin--' + kind + '">' +
        '<span class="pin__ring"></span>' +
        '<span class="pin__letter">' + letter + '</span>' +
      '</div>',
      iconSize: [34, 34],
      // ancora no centro do circulo, nao na ponta
      iconAnchor: [17, 17],
      popupAnchor: [0, -19]
    });
  }

  var originIcon = pinIcon('A', 'origin');
  var destIcon = pinIcon('B', 'destination');

  var markOrigin = L.marker([CFG.center.lat, CFG.center.lon], {
    icon: originIcon, draggable: true, zIndexOffset: 1000
  }).addTo(map);
  var markDest = L.marker([CFG.center.lat, CFG.center.lon], {
    icon: destIcon, draggable: true, zIndexOffset: 1000
  }).addTo(map);

  markOrigin.setOpacity(0);
  markDest.setOpacity(0);

  markOrigin.on('dragend', function () {
    var p = markOrigin.getLatLng();
    state.origin = { lat: p.lat, lon: p.lng, label: 'Ponto A' };
    el.origin.value = 'Ponto A (arrastrado)';
    scheduleRoute();
  });

  markDest.on('dragend', function () {
    var p = markDest.getLatLng();
    state.destination = { lat: p.lat, lon: p.lng, label: 'Ponto B' };
    el.destination.value = 'Ponto B (arrastrado)';
    scheduleRoute();
  });

  /* "Para onde?" so faz sentido na folha vazia. Na tela de confirmacao
   * (destino definido + rota desenhada) os tres rostos do chamado somem:
   * ja esta tudo dito no resumo A -> B. Sem rota (erro, calculando, limpo)
   * eles voltam, porque e por eles que o usuario muda o destino. Cancelar
   * zera o destino e tudo volta junto. */
  function atualizarParaOnde() {
    var escondido = !!state.destination && state.routes.length > 0;
    if (el.btnWhere) el.btnWhere.classList.toggle('hidden', escondido);
    if (el.btnWhereFloat) {
      el.btnWhereFloat.classList.toggle('hidden', escondido || state.nav.ativo);
    }
    if (el.emptyNote) el.emptyNote.classList.toggle('hidden', !!state.destination);
  }

  /* ------------------------------------------------------------------ *
   * Favoritos: botao no canto inferior esquerdo, lista que abre acima
   * dele e o perguntar da chegada. O modulo de persistencia mora em
   * js/favoritos.js (window.NAV_FAVORITOS); aqui e so a UI.
   * ------------------------------------------------------------------ */

  function fecharFavoritos() {
    if (!el.favList) return;
    el.favList.classList.add('hidden');
    if (el.btnFav) el.btnFav.setAttribute('aria-expanded', 'false');
  }

  function renderFavoritos() {
    if (!el.favList) return;
    var lista = window.NAV_FAVORITOS ? NAV_FAVORITOS.load() : [];
    if (!lista.length) {
      el.favList.innerHTML =
        '<p class="fav-empty">Nenhum favorito ainda. Ao chegar a um destino, ' +
        'perguntamos se voce quer guarda-lo aqui.</p>';
      return;
    }
    el.favList.innerHTML = lista.map(function (f, i) {
      return '<div class="fav-item">' +
        '<button type="button" class="fav-item-main" data-index="' + i + '" title="' +
          esc(f.nome) + '">' +
          '<span class="fav-star" aria-hidden="true">&#9733;</span>' +
          '<span class="fav-nome">' + esc(f.nome) + '</span>' +
        '</button>' +
        '<button type="button" class="fav-del" data-index="' + i + '" ' +
          'aria-label="Remover dos favoritos" title="Remover">&times;</button>' +
      '</div>';
    }).join('');

    Array.prototype.forEach.call(
      el.favList.querySelectorAll('.fav-item-main'),
      function (btn) {
        btn.addEventListener('click', function () {
          var item = (window.NAV_FAVORITOS ? NAV_FAVORITOS.load() : [])[Number(btn.getAttribute('data-index'))];
          if (!item) return;
          fecharFavoritos();
          applyPlace('destination', { label: item.nome, lat: item.lat, lon: item.lon });
        });
      }
    );
    Array.prototype.forEach.call(
      el.favList.querySelectorAll('.fav-del'),
      function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (window.NAV_FAVORITOS) NAV_FAVORITOS.remove(Number(btn.getAttribute('data-index')));
          renderFavoritos();
        });
      }
    );
  }

  function alternarFavoritos() {
    if (!el.favList) return;
    var aberto = !el.favList.classList.contains('hidden');
    if (aberto) { fecharFavoritos(); return; }
    renderFavoritos();
    el.favList.classList.remove('hidden');
    if (el.btnFav) el.btnFav.setAttribute('aria-expanded', 'true');
  }

  /* Pergunta de chegada: so se tem destino e ele ainda nao esta salvo.
     Devolve true quando o card foi mostrado (nesse caso quem cuida do
     aviso "Voce chegou." e a resposta ao card). */
  function perguntarFavoritoNaChegada() {
    if (!el.favAsk || !state.destination || !window.NAV_FAVORITOS) return false;
    if (NAV_FAVORITOS.tem(state.destination)) return false;
    el.favAsk.classList.remove('hidden');
    return true;
  }

  function esconderPerguntaFavorito() {
    if (el.favAsk) el.favAsk.classList.add('hidden');
  }

  function clearRouteLayers() {
    // A navegacao so morre quando a rota deixa de existir (botao limpar,
    // origem/destino apagados). Rotear de novo TROCA a rota por outra com
    // o GPS ligado — replanejamento automatico no desvio, troca de
    // alternativa — e nesse caso a navegacao tem de seguir de onde parou.
    // Antes ela morria aqui, derrubando o foreground service a cada
    // replanejamento no meio da viagem.
    if (state.nav.ativo && (!state.origin || !state.destination)) pararNavegacao();
    state.layers.forEach(function (l) { map.removeLayer(l); });
    state.layers = [];
    if (!state.nav.ativo) el.navSection.classList.add('hidden');
    atualizarParaOnde();
  }

  /* ------------------------------------------------------------------ *
   * Busca com autocomplete (Photon)
   * ------------------------------------------------------------------ */

  var searchTimer = null;
  var searchSeq = 0;

  function hideSuggestions() {
    el.suggestions.classList.add('hidden');
    el.suggestions.innerHTML = '';
  }

  function showSuggestions(items, field) {
    if (!items.length) { hideSuggestions(); return; }
    el.suggestions.innerHTML = items.map(function (it, i) {
      return '<button type="button" class="suggestion" data-field="' + field +
        '" data-index="' + i + '">' + esc(it.label) + '</button>';
    }).join('');
    el.suggestions.classList.remove('hidden');

    Array.prototype.forEach.call(
      el.suggestions.querySelectorAll('.suggestion'),
      function (btn) {
        btn.addEventListener('click', function () {
          var chosen = items[Number(btn.getAttribute('data-index'))];
          applyPlace(field, chosen);
          hideSuggestions();
        });
      }
    );
  }

  function runSearch(field, query) {
    var seq = ++searchSeq;
    // a chave vem das configuracoes e so e usada se as bases abertas
    // vierem vazias. Sem chave, o comportamento e o de sempre.
    var opts = { geoapifyKey: (state.settings && state.settings.geoapifyKey) || '' };
    SVC.searchPlaces(query, 8, opts).then(function (items) {
      if (seq !== searchSeq) return; // resposta obsoleta
      showSuggestions(items, field);
    }).catch(function (err) {
      if (seq !== searchSeq) return;
      showError('Falha na busca: ' + err.message);
    });
  }

  function applyPlace(field, place) {
    var input = field === 'origin' ? el.origin : el.destination;
    input.value = place.label;
    state[field] = { lat: place.lat, lon: place.lon, label: place.label };
    state.picking = null;
    setHint(null);
    updateMarkers();

    // Destino escolhido na busca: ja prepara a rota (com a origem no GPS, se
    // faltar) e abre a folha com o resumo e o botao "Vamos la". A navegacao
    // so comeca quando o usuario toca no botao. No modo avancado, so planeja.
    if (field === 'destination' && !(state.settings && state.settings.advancedFields)) {
      if (!state.origin && typeof currentPosition === 'function') {
        definirOrigemAtual().then(function () {
          updateMarkers();
          calculateRoute();
        });
        return;
      }
      calculateRoute();
      return;
    }

    scheduleRoute();
  }

  /* Preenche a origem com o GPS e devolve quando terminar. Nao calcula a
   * rota aqui: quem chamou decide quando chamar scheduleRoute. */
  function definirOrigemAtual() {
    setHint('Usando sua localizacao atual como origem\u2026');
    return currentPosition().then(function (pos) {
      return SVC.snapToRoad(pos.lat, pos.lon).then(function (snapped) {
        var p = snapped && snapped.snapped ? snapped : pos;
        return SVC.reverseGeocode(p.lat, p.lon).catch(function () {
          return 'Minha posicao';
        }).then(function (label) {
          var nome = label || 'Minha posicao';
          setPoint('origin', p.lat, p.lon, nome);
          if (el.origin) el.origin.value = nome;
          setHint(null);
        });
      });
    }).catch(function (err) {
      setHint(null);
      showError('Nao consegui usar sua localizacao: ' + err.message);
    });
  }

  [ { field: 'origin', input: el.origin },
    { field: 'destination', input: el.destination }
  ].forEach(function (pair) {
    pair.input.addEventListener('input', function () {
      clearError();
      state[pair.field] = null; // texto editado: ainda nao sabemos as coords
      var q = pair.input.value;
      clearTimeout(searchTimer);
      if (q.trim().length < 3) { hideSuggestions(); return; }
      searchTimer = setTimeout(function () {
        runSearch(pair.field, q);
      }, CFG.searchDebounceMs);
    });

    pair.input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); hideSuggestions(); el.btnRoute.click(); }
      if (ev.key === 'Escape') { hideSuggestions(); }
    });
  });

  /* ------------------------------------------------------------------ *
   * Escolher ponto no mapa
   * ------------------------------------------------------------------ */

  function startPicking(field) {
    state.picking = field;
    setHint('<strong>Toque no mapa</strong> para definir o ponto ' +
      (field === 'origin' ? 'de <strong>origem</strong>' : 'de <strong>destino</strong>') +
      '. <a href="#" id="cancel-pick">cancelar</a>');
    var cancel = document.getElementById('cancel-pick');
    if (cancel) {
      cancel.addEventListener('click', function (ev) {
        ev.preventDefault();
        state.picking = null;
        setHint(null);
      });
    }
  }

  map.on('click', function (ev) {
    if (!state.picking) {
      // Clique fora da folha (no mapa) fecha o painel, como um "X".
      fecharPainel();
      fecharCamadas();
      fecharBasemap();
      return;
    }
    var field = state.picking;
    var input = field === 'origin' ? el.origin : el.destination;
    var clicked = ev.latlng;

    state.picking = null;
    setHint('Ajustando o ponto na rua mais proxima...');

    SVC.snapToRoad(clicked.lat, clicked.lng).then(function (p) {
      setPoint(field, p.lat, p.lon, 'Ponto no mapa');
      input.value = p.snapped
        ? 'Ponto na via (' + p.meters + ' m de ajuste)'
        : 'Ponto no mapa';
      setHint(null);
      updateMarkers();
      scheduleRoute();
    });
  });

  function setPoint(field, lat, lon, label) {
    state[field] = { lat: lat, lon: lon, label: label || '' };
  }

  function updateMarkers() {
    if (state.origin) {
      markOrigin.setLatLng([state.origin.lat, state.origin.lon]).setOpacity(1);
    } else {
      markOrigin.setOpacity(0);
    }
    if (state.destination) {
      markDest.setLatLng([state.destination.lat, state.destination.lon]).setOpacity(1);
    } else {
      markDest.setOpacity(0);
    }
  }

  /* ------------------------------------------------------------------ *
   * Localizacao do usuario
   * ------------------------------------------------------------------ */

  function currentPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('Este dispositivo nao tem geolocalizacao.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        function (err) {
          var msgs = {
            1: 'Permissao de localizacao negada.',
            2: 'Sinal de GPS indisponivel.',
            3: 'Tempo esgotado tentando obter o GPS.'
          };
          reject(new Error(msgs[err.code] || err.message));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  }

  function useMyLocation(field) {
    clearError();
    var input = field === 'origin' ? el.origin : el.destination;
    var previous = input.value;
    input.value = 'Obtendo sua localizacao...';

    currentPosition().then(function (pos) {
      return SVC.snapToRoad(pos.lat, pos.lon).then(function (snapped) {
        var p = snapped.snapped ? snapped : pos;
        setPoint(field, p.lat, p.lon, 'Minha posicao');
        return SVC.reverseGeocode(p.lat, p.lon).then(function (label) {
          setPoint(field, p.lat, p.lon, label);
          input.value = label;
        });
      });
    }).catch(function (err) {
      input.value = previous;
      showError(err.message);
      return;
    }).then(function () {
      updateMarkers();
      scheduleRoute();
    });
  }

  /* ------------------------------------------------------------------ *
   * Calculo e desenho da rota
   * ------------------------------------------------------------------ */

  var routeTimer = null;

  /* Se o recurso "calcular a rota sozinho" estiver desligado, so recalcula
     quando o usuario aperta o botao -- nao quando os pontos mudam. */
  function scheduleRoute() {
    if (state.settings && !state.settings.autoRoute) return;
    clearTimeout(routeTimer);
    routeTimer = setTimeout(function () { calculateRoute(); }, 350);
  }

  function calculateRoute() {
    clearError();
    if (!state.origin || !state.destination) {
      clearRouteLayers();
      state.routes = [];
      hideResults();
      return;
    }

    el.btnRoute.disabled = true;
    el.btnRoute.textContent = 'Calculando...';

    SVC.fetchRoutes(state.origin, state.destination)
      .then(function (routes) {
        state.routes = routes;
        state.active = 0;
        drawRoutes();
      })
      .catch(function (err) {
        clearRouteLayers();
        state.routes = [];
        state.nav.autoIniciar = false;
        hideResults();
        showError(err.message);
      })
      .then(function () {
        el.btnRoute.disabled = false;
        el.btnRoute.textContent = 'Calcular rota';
      });
  }

  function drawRoutes() {
    clearRouteLayers();

    var bounds = [];

    state.routes.forEach(function (route, i) {
      var active = (i === state.active);

      // Casca por baixo: um traço mais grosso e escuro. Sem isso a rota
      // some em cima de mapa claro e fica ilegível sobre o satellite.
      var casing = L.polyline(route.geometry, {
        color: active ? corVar('--route-casing', '#3b0764') : corVar('--ink-soft', '#4b5563'),
        weight: active ? 13 : 8,
        opacity: active ? 0.28 : 0.18,
        lineJoin: 'round',
        lineCap: 'round',
        interactive: false,
        smoothFactor: 1.5
      }).addTo(map);

      var line = L.polyline(route.geometry, {
        color: active ? corVar('--route', '#7c3aed') : corVar('--ink-faint', '#8b95a5'),
        weight: active ? 7 : 4,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round',
        smoothFactor: 1.5
      }).addTo(map);

      line.bindPopup(
        '<strong>Op&ccedil;&atilde;o ' + (i + 1) + '</strong><br>' +
        fmtKm(route.distanceKm) + ' &middot; ' + fmtMin(route.durationSec),
        { closeButton: false }
      );

      line.on('click', function () { selectRoute(i); });

      state.layers.push(casing);
      state.layers.push(line);

      route.geometry.forEach(function (c) { bounds.push(c); });
    });

    // marcadores sempre acima das linhas
    if (state.origin) markOrigin.setZIndexOffset(1000);
    if (state.destination) markDest.setZIndexOffset(1000);

    if (bounds.length) {
      // Durante a navegacao a camera e do usuario: reenquadrar a rota
      // inteira a cada recalculo jogaria o mapa para longe dele.
      if (!state.nav.ativo) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }

    renderChips();
    renderSummary();
    atualizarParaOnde();
    renderSteps();

    // Rotas novas vem com passos recalculados: se a navegacao estiver no ar,
    // a referencia precisa ser trocada, senao os avisos usam a geometria
    // antiga e anunciam manobra no lugar errado.
    if (state.nav.ativo) {
      state.nav.prep = NAV.prepararRota(state.routes[state.active]);
    }

    // Rota pronta e sem navegacao: abre a folha com o resumo (A -> B, km) e o
    // botao "Vamos la". A navegacao so comeca quando o usuario toca no botao.
    if (!state.nav.ativo && state.routes.length) {
      abrirPainel();
    }
  }

  function selectRoute(i) {
    if (i === state.active) return;
    state.active = i;
    drawRoutes();
  }

  function renderChips() {
    if (state.routes.length <= 1) {
      el.routesSection.classList.add('hidden');
    } else {
      el.routesSection.classList.remove('hidden');
      el.routeChips.innerHTML = state.routes.map(function (r, i) {
        var active = (i === state.active) ? ' chip--active' : '';
        return '<button type="button" class="chip' + active + '" data-route="' + i + '">' +
          'Opcao ' + (i + 1) + ' &middot; ' + fmtKm(r.distanceKm) +
          ' &middot; ' + fmtMin(r.durationSec) + '</button>';
      }).join('');

      Array.prototype.forEach.call(el.routeChips.querySelectorAll('.chip'), function (btn) {
        btn.addEventListener('click', function () {
          selectRoute(Number(btn.getAttribute('data-route')));
        });
      });
    }
  }

  function renderSummary() {
    var r = state.routes[state.active];
    if (!r) return;

    // A escolha de como chegar so faz sentido com rota pronta.
    el.navSection.classList.toggle('hidden', !state.destination);
    atualizarParaOnde();

    var extras = [];
    if (r.hasHighway) extras.push('rodovia');
    if (r.hasToll) extras.push('pedagio');

    var origem = state.origin ? (state.origin.label || 'Minha posicao') : '';
    var destino = state.destination ? (state.destination.label || 'Destino') : '';

    var html =
      '<div class="trip">' +
        '<div class="trip-pt">' +
          '<span class="trip-dot trip-dot--a">A</span>' +
          '<span class="trip-name">' + esc(origem) + '</span>' +
        '</div>' +
        '<div class="trip-pt">' +
          '<span class="trip-dot trip-dot--b">B</span>' +
          '<span class="trip-name">' + esc(destino) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="summary-main">' +
        '<span class="summary-time">' + esc(fmtMin(r.durationSec)) + '</span>' +
        '<span class="summary-sep">&middot;</span>' +
        '<span>' + esc(fmtKm(r.distanceKm)) + '</span>' +
      '</div>';

    if (extras.length) {
      html += '<div class="summary-tags">' + extras.map(function (e) {
        return '<span class="tag">' + esc(e) + '</span>';
      }).join('') + '</div>';
    }

    if (state.showFare) html += renderFare(r);

    el.summary.innerHTML = html;
    el.summary.classList.remove('hidden');
  }

  /* Detalhamento da tarifa: a conta aberta, linha por linha. */
  function renderFare(route) {
    var f = SVC.estimateFare(route, { surge: state.surge, profile: state.profile });
    var p = SVC.fareProfile(state.profile);
    var surgeOn = f.surge !== 1;

    var rows = [
      ['Partida', brl(f.base)],
      [fmtKm(f.km) + ' &times; ' + brl(p.perKm), brl(f.distanceCost)],
      [Math.round(f.minutes) + ' min &times; ' + brl(p.perMinute), brl(f.timeCost)]
    ];

    var out = '<div class="fare">' +
      '<div class="fare-head">' +
        '<span class="fare-profile">' + esc(f.label) + '</span>' +
        '<span class="fare-profile-note">' + esc(p.note) + '</span></div>';

    rows.forEach(function (r) {
      out += '<div class="fare-row fare-row--part">' +
        '<span>' + r[0] + '</span><span>' + r[1] + '</span></div>';
    });

    if (f.minApplied) {
      out += '<div class="fare-note">Tarifa minima de ' + brl(p.minFare) + ' aplicada</div>';
    }

    out += '<div class="fare-row fare-row--sub">' +
      '<span>Corrida</span><span>' + brl(f.trip) + '</span></div>';

// Modelo direto: taxa zero e o diferencial, entao mostra isso
    if (f.fee > 0) {
      out += '<div class="fare-row">' +
        '<span>Taxa da plataforma (' + f.feePercent + '%)</span>' +
        '<span>' + brl(f.fee) + '</span></div>';
    } else {
      out += '<div class="fare-row fare-row--free">' +
        '<span>Intermediario</span>' +
        '<span>' + brl(0) + ' <em>direto, sem taxa</em></span></div>';
    }

    if (surgeOn) {
      out += '<div class="fare-row fare-row--surge">' +
        '<span>Bandeira ' + numBr(f.surge) + ' &times; (' + surgeLabel(f.surge) + ')</span>' +
        '<span>' + brl(f.surge * f.subtotal) + '</span></div>';
    }

    out += '<div class="fare-row fare-row--total">' +
      '<span>Total</span><span>' + brl(f.total) + '</span></div>';

    var pctMotorista = f.driver > 0 ? Math.round(f.driver / f.trip * 100) : 0;

    out += '<div class="fare-split">' +
      '<span>Motorista recebe <b>' + brl(f.driver * f.surge) + '</b>' +
      (p.driverEmergencyPercent || p.driverBonusPercent
        ? ' <i>(reserva ' + brl(f.emergency * f.surge) +
          ' + bonus ' + brl(f.bonus * f.surge) + ')</i>'
        : ' <b class="fare-pct">' + pctMotorista + '%</b> do valor') +
      '</span></div>';

    out += '<div class="fare-note fare-note--warn">' +
      'Estimativa sem transito: o tempo e o de via livre.</div>';

    out += '</div>';
    return out;
  }

  /* 1.4 -> "1,4" ; 1 -> "1" */
  function numBr(n) {
    return String(n).replace('.', ',');
  }

  function renderProfileChips() {
    var profiles = CFG.fare.profiles;
    el.profileChips.innerHTML = Object.keys(profiles).map(function (key) {
      var active = (key === state.profile) ? ' chip--active' : '';
      return '<button type="button" class="chip' + active + '" data-profile="' + key + '">' +
        esc(profiles[key].label) + '</button>';
    }).join('');

    Array.prototype.forEach.call(el.profileChips.querySelectorAll('.chip'), function (btn) {
      btn.addEventListener('click', function () {
        state.profile = btn.getAttribute('data-profile');
        renderProfileChips();
        renderSummary();
      });
    });
  }

  function renderSurgeChips() {
    var opts = CFG.fare.surgeOptions;
    el.surgeChips.innerHTML = opts.map(function (s) {
      var active = (s === state.surge) ? ' chip--active' : '';
      return '<button type="button" class="chip' + active + '" data-surge="' + s + '">' +
        numBr(s) + ' &middot; ' + esc(surgeLabel(s)) + '</button>';
    }).join('');

    Array.prototype.forEach.call(el.surgeChips.querySelectorAll('.chip'), function (btn) {
      btn.addEventListener('click', function () {
        state.surge = Number(btn.getAttribute('data-surge'));
        renderSurgeChips();
        renderSummary();
      });
    });
  }

  function renderSteps() {
    var r = state.routes[state.active];
    if (!r) return;

    el.steps.innerHTML = r.steps.map(function (s, i) {
      var dist = s.distance > 0 ? fmtKm(s.distance) : '';
      var roundabout = s.roundaboutExit
        ? ' <span class="muted">(' + s.roundaboutExit + '&ordm; sa&iacute;da)</span>'
        : '';
      return '<li class="step' + (i === 0 ? ' step--first' : '') + '">' +
        '<span class="step-icon" aria-hidden="true">' + esc(s.icon) + '</span>' +
        '<span class="step-body">' +
          '<span class="step-text">' + esc(s.instruction) + roundabout + '</span>' +
          (s.street ? '<span class="step-street">' + esc(s.street) + '</span>' : '') +
        '</span>' +
        '<span class="step-dist">' + esc(dist) + '</span>' +
      '</li>';
    }).join('');

    el.stepsSection.classList.toggle('hidden',
      !state.settings || !state.settings.showSteps);
    el.emptyNote.classList.add('hidden');
  }

  function hideResults() {
    el.summary.classList.add('hidden');
    el.stepsSection.classList.add('hidden');
    el.routesSection.classList.add('hidden');
    el.navSection.classList.add('hidden');
    atualizarParaOnde();
  }

  /* ------------------------------------------------------------------ *
   * Navegacao por manobras
   * ------------------------------------------------------------------ */

  // Abaixo disto e ruido de GPS, nao desvio: dentro de um tunel ou sob um
  // viaduto a posicao salta dezenas de metros e a rota "recalcularia" sem
  // motivo. Acima disso, sustentado por poucos fixos, e desvio mesmo: o
  // replanejamento rota o mais rapido possivel (o usuario ja saiu do caminho).
  var LIMITE_DESVIO_M = 60;      // comeca a contar o desvio
  var DESVIO_GRAVE_M = 150;      // longe da rota: nem espera o tempo cheio
  var ESPERA_DESVIO_MS = 2500;   // ~2 fixos de GPS sustentados
  var ESPERA_GRAVE_MS = 1200;    // 1 fixo ja basta quando o desvio e grande
  var ESPERA_REPLAN_MS = 8000;   // cooldown: evita martelar a API no mesmo desvio
  var AVISO_MANOBRA_M = 150;
  var ROTA_SNAP_M = 45;          // ate aqui o desenho do carro cola na rota

  var markMe = null;
  var meCircle = null;
  var markBairro = null;

  function criarMarcadorUsuario() {
    markMe = L.marker([CFG.center.lat, CFG.center.lon], {
      icon: L.divIcon({
        className: 'me-wrap',
        // Dot azul no modo comum (como o Maps fora da navegacao); na
        // navegacao troca pelo carrinho/seta, que gira com o rumo.
        html:
          '<div class="me-cone"></div>' +
          '<div class="me-halo"></div>' +
          '<div class="me-dot"></div>' +
          '<div class="me-car">' +
            '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
              '<path d="M24 3 C33.5 11 38 19 38 27.5 C38 36.5 31.5 44 24 44 ' +
                      'C16.5 44 10 36.5 10 27.5 C10 19 14.5 11 24 3 Z" ' +
                      'class="me-car-body" stroke="#fff" stroke-width="2.6" ' +
                      'stroke-linejoin="round"/>' +
              '<circle cx="24" cy="27" r="5.2" class="me-car-hole"/>' +
            '</svg>' +
          '</div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      }),
      interactive: false,
      zIndexOffset: 1200,
      opacity: 0
    }).addTo(map);

    // Circulo de precisao: mostra o raio real de erro do GPS, que e o que
    // decide se vale ou nao replanejar.
    meCircle = L.circle([CFG.center.lat, CFG.center.lon], {
      radius: 0,
      color: corVar('--car', '#2563eb'),
      weight: 1,
      opacity: .35,
      fillColor: corVar('--car', '#2563eb'),
      fillOpacity: .08,
      interactive: false
    }).addTo(map);

    // Balao do setor/bairro: ancorado no ponto do GPS, com a setinha
    // apontando para baixo. Nasce escondido e so aparece quando o Nominatim
    // responde em que setor a pessoa esta (ver mostrarBalaoBairro).
    markBairro = L.marker([CFG.center.lat, CFG.center.lon], {
      icon: L.divIcon({
        className: 'bairro-balao-wrap hidden',
        html: '<div class="bairro-balao"><span class="bairro-balao-txt"></span></div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      }),
      interactive: false,
      zIndexOffset: 1100
    }).addTo(map);
  }

  /* Escreve o setor/bairro no balao e o mostra; sem nome, esconde. */
  function mostrarBalaoBairro(nome) {
    if (!markBairro) return;
    var raiz = markBairro.getElement();
    if (!raiz) return;
    var txt = raiz.querySelector('.bairro-balao-txt');
    if (txt) txt.textContent = nome || '';
    raiz.classList.toggle('hidden', !nome);
  }

  /* Rota atualizada do carro, acumulada para girar pelo caminho curto.
   * Sem isso, girando de 359 graus para 1 grau a seta faria a volta
   * inteira para tras — igual a agulha de uma bussola numa manobra. */
  function girarCarro(dir) {
    var elCar = markMe && markMe.getElement() && markMe.getElement().querySelector('.me-car');
    if (!elCar || typeof dir !== 'number') return;

    var alvo = ((dir % 360) + 360) % 360;
    var atual = state.nav.meDir;
    if (atual === null || atual === undefined) atual = alvo;
    var delta = ((alvo - atual) % 360 + 540) % 360 - 180;
    state.nav.meDir = atual + delta;
    elCar.style.transform = 'rotate(' + state.nav.meDir + 'deg)';
  }

  function navAviso(texto, warn) {
    if (!texto) {
      el.navMsg.classList.add('hidden');
      return;
    }
    el.navMsg.textContent = texto;
    el.navMsg.classList.toggle('nav-msg--warn', !!warn);
    el.navMsg.classList.remove('hidden');
  }

  function navFalar(texto) {
    if (!texto || state.nav.mudo) return;
    if (state.nav.ponte) state.nav.ponte.falar(texto);
  }

  /* "Vire na esquerda" vira "Em 80 metros, vire na esquerda". */
  function fraseVoz(texto, distM) {
    var t = String(texto || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    var lead = distM <= AVISO_MANOBRA_M
      ? 'Em ' + Math.max(10, Math.round(distM / 10) * 10) + ' metros, '
      : '';
    return lead + t.charAt(0).toLowerCase() + t.slice(1);
  }

  /* ------------------------------------------------------------------ *
   * Giro do mapa (heading-up)
   *
   * Na navegacao o mapa gira para deixar o rumo do carro sempre para o
   * topo, com o carrinho parado no centro; o mundo e que anda. O rumo
   * chega do GPS (ou do tracado da rota) e entra em definirRumoMapa; um
   * laco suaviza o giro para o mapa nao dar tranco a cada leitura.
   * ------------------------------------------------------------------ */

  function definirRumoMapa(dir) {
    if (typeof dir !== 'number') return;
    // O plugin gira no sentido horario; o negativo deixa o rumo para cima.
    state.nav.bAlvo = ((-dir % 360) + 360) % 360;
  }

  function iniciarGiroMapa() {
    if (typeof map.setBearing !== 'function' || state.nav.girando) return;
    state.nav.girando = true;
    var passo = function () {
      if (!state.nav.girando) return;
      var d = ((state.nav.bAlvo - state.nav.bAtual) % 360 + 540) % 360 - 180;
      if (Math.abs(d) > 0.05) {
        state.nav.bAtual = (((state.nav.bAtual + d * 0.2) % 360) + 360) % 360;
        map.setBearing(state.nav.bAtual);
      }
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  function pararGiroMapa() {
    state.nav.girando = false;
    state.nav.bAlvo = 0;
    state.nav.bAtual = 0;
    if (typeof map.setBearing === 'function') map.setBearing(0);
  }

  function iniciarNavegacao() {
    var rota = state.routes[state.active];
    if (!rota || !state.destination) {
      showError('Calcule a rota antes de iniciar a navegacao.');
      return;
    }
    clearError();

    state.nav.ativo = true;
    state.nav.prep = NAV.prepararRota(rota);
    state.nav.falados = {};
    state.nav.chegou = false;
    state.nav.offDesde = 0;
    state.nav.ultimoReplan = 0;
    state.nav.seguir = true;
    state.nav.zoomado = false;
    state.nav.meDir = null;
    state.nav.bAlvo = 0;
    state.nav.bAtual = 0;
    limparCamadasNav();
    state.nav.ponte = NAV.ponte();
    // Reforco: app de rota nao pode apagar a tela no meio do caminho. O
    // boot ja liga, mas aqui garante de novo (o plugin pode so ficar
    // pronto depois do primeiro carregamento).
    state.nav.ponte.ligarTelaSempre();

    el.navChoice.classList.add('hidden');
    el.navHud.classList.remove('hidden');
    el.navBar.classList.remove('hidden');
    if (el.navSpeedVal) el.navSpeedVal.textContent = '0';
    el.navMute.setAttribute('aria-pressed', 'true');
    atualizarParaOnde();
    // o olho continua visivel na navegacao, por baixo do HUD de instrucoes
    // (o CSS .navegando o reposiciona); so os paineis fecham
    document.body.classList.add('navegando');
    fecharCamadas();
    fecharBasemap();
    // o GPS da navegacao assume o quadro do posto; solta o watch proprio
    pararWatchPostos();
    // o watch de fundo tambem sai do caminho: dois GPS lendo ao mesmo
    // tempo so gastam bateria e brigam pelo mesmo dado
    pararWatchGeo();
    if (el.btnPanel) el.btnPanel.classList.add('hidden');
    fecharPainel();

    // Escuta as posicoes do GPS uma unica vez: registrado de novo a cada
    // navegacao, o nativo duplicaria os avisos de posicao.
    if (!state.nav.posLigado) {
      state.nav.posLigado = true;
      state.nav.ponte.aoPosicionar(aoPosicao);
      state.nav.ponte.aoAvisar(function (msg) {
        navAviso(msg, true);
      });
    }

    iniciarGiroMapa();

    el.navHudText.textContent = 'Aguardando sinal de GPS';
    el.navHudStreet.textContent = state.destination ? state.destination.label : '';
    el.navHudDist.textContent = '--';
    el.navHudRemain.textContent = '';
    navAviso(null);

    var destino = state.destination.label || 'o destino';
    state.nav.ponte.iniciar({ texto: 'Navegando para ' + destino }).catch(function (err) {
      showError(err && err.message ? err.message : 'Nao foi possivel iniciar o GPS.');
      pararNavegacao();
    });

    map.invalidateSize();
  }

  function pararNavegacao() {
    if (!state.nav.ativo) return;
    state.nav.ativo = false;
    state.nav.prep = null;
    state.nav.falados = {};
    pararGiroMapa();
    limparCamadasNav();

    if (state.nav.ponte) {
      state.nav.ponte.parar().catch(function () { });
      state.nav.ponte.pararFala().catch(function () { });
    }

    el.navHud.classList.add('hidden');
    el.navBar.classList.add('hidden');
    el.navChoice.classList.remove('hidden');
    el.navMute.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('navegando');
    atualizarParaOnde();
    if (el.btnEye) el.btnEye.classList.remove('hidden');
    // o watch de fundo volta a alimentar o retangulo de setor/bairro. Ele
    // precisa subir antes do de postos: com ele ligado, o de postos cede
    // (iniciarWatchPostos) e nao duplica o custo de GPS.
    iniciarWatchGeo();
    // sem navegacao ativa, se a camada de postos estiver ligada volta o watch
    if (state.postos.ligada) {
      state.postos.ultimo = null;
      iniciarWatchPostos();
    }
    if (el.btnPanel) el.btnPanel.classList.remove('hidden');
    esconderPerguntaFavorito();
    navAviso(null);

    if (markMe) markMe.setOpacity(0);
    if (meCircle) meCircle.setRadius(0);
  }

  /* Cancelar a rota: encerra a navegacao (se ativa) e apaga destino/rota do
   * mapa, voltando ao estado "Para onde?". Diferente de pararNavegacao, que
   * so para a guiagem e mantem a rota desenhada. */
  function cancelarRota() {
    if (state.nav.ativo) pararNavegacao();

    state.destination = null;
    state.routes = [];
    state.active = 0;
    state.picking = null;
    if (el.destination) el.destination.value = '';

    clearRouteLayers();
    if (el.summary) {
      el.summary.classList.add('hidden');
      el.summary.innerHTML = '';
    }
    el.navSection.classList.add('hidden');
    el.navChoice.classList.remove('hidden');

    updateMarkers();
    fecharPainel();
    navAviso('Rota cancelada.');
    setTimeout(function () {
      if (el.navMsg && el.navMsg.textContent === 'Rota cancelada.') navAviso(null);
    }, 2500);
  }

  function alternarVoz() {
    state.nav.mudo = !state.nav.mudo;
    el.navMute.setAttribute('aria-pressed', state.nav.mudo ? 'false' : 'true');
    if (state.nav.ponte) state.nav.ponte.mudo(state.nav.mudo).catch(function () { });
    if (state.nav.mudo) navAviso('Voz desligada. O painel continua mostrando as manobras.');
    else navAviso('Voz religada.');
  }

  /* Cada leitura do GPS passa por aqui. */
  function aoPosicao(p) {
    state.nav.ultimaPos = p;
    var prep = state.nav.prep;
    var perto = (prep && prep.geometry.length)
      ? NAV.maisPerto(prep.geometry, prep.cums, p.lat, p.lon)
      : null;
    posicionarUsuario(p, perto);
    // durante a navegacao e o GPS do aparelho que alimenta o quadro do posto
    checarPostoPerto(p.lat, p.lon);

    if (!prep || !prep.geometry.length) return;

    var rest = NAV.restante(prep, perto.along);

    approximarNav(p);
    atualizarPercurso(prep, perto);
    atualizarManobra(prep, perto);
    atualizarBairro(p);

    // Desvio sustentado: recalcula rapido, mas nao em todo fixo de GPS
    // (ruido de tunel/viaduto). Desvio grave nem espera o tempo cheio.
    var agora = Date.now();
    if (perto.dist > LIMITE_DESVIO_M) {
      if (!state.nav.offDesde) {
        state.nav.offDesde = agora;
      } else {
        var espera = perto.dist > DESVIO_GRAVE_M ? ESPERA_GRAVE_MS : ESPERA_DESVIO_MS;
        if (agora - state.nav.offDesde > espera
          && agora - state.nav.ultimoReplan > ESPERA_REPLAN_MS) {
          state.nav.ultimoReplan = agora;
          state.nav.offDesde = 0;
          replanejar();
          return;
        }
      }
    } else {
      state.nav.offDesde = 0;
    }

    // Chegada
    if (rest.chegou && !state.nav.chegou) {
      state.nav.chegou = true;
      state.nav.seguir = false;
      navFalar('Voce chegou ao seu destino.');
      // se o destino ainda nao esta nos favoritos, o card pergunta antes
      // de mostrar o aviso de chegada (mesma faixa da tela, um sobre o
      // outro); a resposta mostra o aviso.
      if (!perguntarFavoritoNaChegada()) navAviso('Voce chegou.');
      el.navHudText.textContent = 'Voce chegou';
      el.navHudStreet.textContent = state.destination ? state.destination.label : '';
      el.navHudDist.textContent = '--';
      el.navHudRemain.textContent = '';
      if (el.navSpeedVal) el.navSpeedVal.textContent = '0';
      if (el.navBarEta) el.navBarEta.textContent = '--:--';
      return;
    }

    // Proxima manobra e aviso de voz
    var prox = NAV.proximoPasso(prep, perto.along);
    if (prox) {
      var chave = 'p' + prox.indice;
      if (!state.nav.falados[chave] && prox.dist <= AVISO_MANOBRA_M) {
        state.nav.falados[chave] = true;
        navFalar(fraseVoz(prox.passo.instruction, prox.dist));
      }
    }

    renderHud(perto, rest, prox);
  }

  /* Ponto da rota mais proximo do usuario, para "colar" o carrinho na via.
     O GPS joga o carro 10-30 m pra fora (predios, arvore); com a rota a ate
     45 m, mostra ele em cima do tracado como fazem Waze e Maps. So muda o
     DESENHO: a matematica de desvio/manobra continua usando o GPS cru. */
  function pontoNaRota(prep, perto) {
    if (!prep || !prep.geometry || !perto || perto.dist > ROTA_SNAP_M) return null;
    var g = prep.geometry;
    var a = g[perto.indice];
    var b = g[perto.indice + 1];
    if (!a) return null;
    if (!b) return { lat: a[0], lon: a[1] };
    return {
      lat: a[0] + (b[0] - a[0]) * perto.t,
      lon: a[1] + (b[1] - a[1]) * perto.t
    };
  }

  function posicionarUsuario(p, perto) {
    if (!markMe) return;
    var onde = p;
    if (state.nav.ativo) {
      var naRota = pontoNaRota(state.nav.prep, perto);
      if (naRota) onde = naRota;
    }
    markMe.setLatLng([onde.lat, onde.lon]).setOpacity(1);
    if (markBairro) markBairro.setLatLng([onde.lat, onde.lon]);
    if (meCircle && p.acc) meCircle.setLatLng([onde.lat, onde.lon]).setRadius(p.acc);

    var elMe = markMe.getElement();

    if (state.nav.ativo && state.nav.prep) {
      // Modo navegacao: dot vira carrinho.
      if (elMe) elMe.classList.add('me-wrap--nav');

      var dirCarro;
      if (p.vel && p.vel > 1.2 && typeof p.dir === 'number') {
        dirCarro = p.dir;
      } else {
        // Parado, em tunel ou entre predios o GPS nao da rumo. Em vez de
        // a seta apontar para um lado qualquer, acompanha o traçado da rota.
        var pertoDir = perto || NAV.maisPerto(state.nav.prep.geometry,
          state.nav.prep.cums, p.lat, p.lon);
        dirCarro = NAV.direcaoGeometria(state.nav.prep, pertoDir.along);
      }

      if (typeof dirCarro === 'number') {
        if (typeof map.setBearing === 'function') {
          // Heading-up: o mapa gira para o rumo ficar no topo, entao o
          // carrinho aponta para cima, sempre no centro.
          definirRumoMapa(dirCarro);
          girarCarro(0);
        } else {
          girarCarro(dirCarro);
        }
      }
    } else {
      // Fora da navegacao, o dot azul com o cone de direcao, como antes.
      if (elMe) elMe.classList.remove('me-wrap--nav');
      var cone = elMe && elMe.querySelector('.me-cone');
      if (cone) {
        if (p.vel && p.vel > 1.2 && p.dir) {
          cone.style.display = 'block';
          cone.style.transform = 'rotate(' + p.dir + 'deg)';
        } else {
          cone.style.display = 'none';
        }
      }
    }

    if (state.nav.seguir) map.panTo(alvoCamera(onde), { animate: true, duration: 0.5 });
  }

  /* Centro da camera: com navOffsetY ligado, o carro fica off px abaixo do
   * meio da tela (mais estrada a frente, como no Waze). O ponto devolvido e
   * o que o mapa deve centralizar: calculado em pontos de container, o
   * rotate do Leaflet ja entra na conta. Sem offset, devolve o proprio
   * carro -- comportamento identico ao antigo. */
  function alvoCamera(onde) {
    var off = (state.nav.ativo && CFG.navOffsetY) ? CFG.navOffsetY : 0;
    if (!off || typeof map.latLngToContainerPoint !== 'function') {
      return [onde.lat, onde.lon];
    }
    try {
      var pt = map.latLngToContainerPoint([onde.lat, onde.lon]);
      return map.containerPointToLatLng([pt.x, pt.y - off]);
    } catch (e) {
      return [onde.lat, onde.lon];
    }
  }

  /* ------------------------------------------------------------------ *
   * Postos de gasolina (camada ligada pelo botao do "olho")
   *
   * O GasoRadar nao manda cabecalho de CORS, entao nao da para buscar os
   * postos em tempo de execucao no WebView. O app le um retrato dos postos
   * de Goiania embutido no APK (data/postos-goiania.json, gerado por
   * scripts/baixar-postos.js e com os precos trocados pelos oficiais da
   * ANP por scripts/atualizar-precos-anp.js).
   *
   * O preco da base e so o de partida: quando ele estiver errado ou
   * desatualizado, o usuario corrige pelo "Editar precos" e o valor dele
   * passa a valer no chip, no popup e no cartao do posto (js/precos.js,
   * guardado no proprio aparelho). O chip mostra sempre a Gasolina Comum;
   * sem valor nenhum o chip fica vazio. Chegando a menos de RAIO_POSTO_M
   * aparece o quadro com os combustiveis disponiveis.
   * ------------------------------------------------------------------ */

  var RAIO_POSTO_M = 250;   // distancia que dispara o quadro do posto
  var POSTO_MIN_MOV = 25;   // so reavalia depois de andar tanto
  var RAIO_VISAO_POSTO_M = 2000;   // na visao "proximos", so ate 2 km
  var POSTO_VISAO_MIN_MOV = 500;   // so redesenha depois de andar isso

  var PRECOS_POSTO = [
    ['gc', 'Comum'],
    ['ga', 'Aditivada'],
    ['etanol', 'Etanol'],
    ['diesel', 'Diesel S10'],
    ['gnv', 'GNV']
  ];

  /* Junta o preco informado pelo usuario (js/precos.js) com a base embutida
     (ANP). O valor da pessoa manda; onde ela nao mexeu vale o da base.
     Guarda o que veio do arquivo em p.precosBase para saber o que e "da
     base" e o que e "informado por quem abasteceu". */
  function aplicarPrecos(lista) {
    (lista || []).forEach(aplicarPrecosPosto);
  }

  function aplicarPrecosPosto(p) {
    if (!p) return;
    if (p.precosBase === undefined) p.precosBase = p.precos || {};
    p.precos = PRECOS ? PRECOS.efetivo(p.id, p.precosBase) : (p.precos || {});
  }

  /* Preco que estampa o chip: sempre a Gasolina Comum (o combustivel que
   * serve de referencia). Se nao houver preco algum, o chip fica vazio. */
  function precoChip(p) {
    return (p.precos && p.precos.gc != null) ? p.precos.gc : null;
  }

  function precoCurto(v) {
    if (v == null) return null;
    return 'R$ ' + v.toFixed(2).replace('.', ',');
  }

  function enderecoPosto(p) {
    return [p.rua, p.bairro].filter(Boolean).join(', ');
  }

  function distanciaM(lat1, lon1, lat2, lon2) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function postoIcone(p) {
    var v = precoChip(p);
    var html = '<div class="posto-chip' + (v == null ? ' posto--sem' : '') + '">' +
      '<span aria-hidden="true">\u26FD</span>' +
      '<span class="posto-preco">' + (v == null ? 's/pre\u00e7o' : precoCurto(v)) + '</span>' +
      '</div>';
    return L.divIcon({
      className: 'posto-wrap',
      html: html,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
      popupAnchor: [0, -16]
    });
  }

  function popupPosto(p) {
    var linhas = PRECOS_POSTO.map(function (par) {
      var v = p.precos && p.precos[par[0]];
      if (v == null) return '';
      return '<tr><td>' + par[1] + '</td><td>' + precoCurto(v) + '</td></tr>';
    }).join('');
    return '<div class="posto-pop">' +
      '<b>' + esc(p.nome) + '</b>' +
      (p.bandeira ? ' <span class="posto-brand">' + esc(p.bandeira) + '</span>' : '') +
      '<div class="posto-end">' + (esc(enderecoPosto(p)) || 'Endere\u00e7o n\u00e3o informado') + '</div>' +
      (linhas
        ? '<table>' + linhas + '</table>'
        : '<div class="posto-end">Sem pre\u00e7os informados.</div>') +
      '<button type="button" class="posto-edit-btn">Editar pre\u00e7os</button>' +
      '<button type="button" class="posto-rota">Tra\u00e7ar rota at\u00e9 aqui</button>' +
      '</div>';
  }

  function rotaAtePosto(p) {
    applyPlace('destination', { lat: p.lat, lon: p.lon, label: p.nome });
    map.closePopup();
    abrirPainel();
  }

  function desenharPostos() {
    if (state.postos.camada) return;
    // Na visao "proximos" so entram os postos dentro do raio, em volta da
    // ultima posicao conhecida. Sem posicao ainda, desenha a base inteira
    // (e o proximo fixo de GPS refaz o recorte).
    var centro = state.postos.visao === 'perto' ? ancoraPostos() : null;
    var grupo = L.layerGroup();
    var desenhados = 0;
    state.postos.lista.forEach(function (p) {
      if (p.lat == null || p.lon == null) return;
      if (centro && distanciaM(centro.lat, centro.lon, p.lat, p.lon) > RAIO_VISAO_POSTO_M) return;
      desenhados++;
      var m = L.marker([p.lat, p.lon], {
        icon: postoIcone(p),
        title: p.nome,
        keyboard: false
      });
      m.bindPopup(popupPosto(p), { minWidth: 190, maxWidth: 260 });
      m.on('popupopen', function () {
        var raiz = m.getPopup() && m.getPopup().getElement();
        var btn = raiz && raiz.querySelector('.posto-rota');
        if (btn) btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          rotaAtePosto(p);
        });
        var btnEditar = raiz && raiz.querySelector('.posto-edit-btn');
        if (btnEditar) btnEditar.addEventListener('click', function (ev) {
          ev.preventDefault();
          map.closePopup();
          abrirEditorPosto(p);
        });
      });
      grupo.addLayer(m);
    });
    state.postos.camada = grupo;
    state.postos.centro = centro ? { lat: centro.lat, lon: centro.lon } : null;
    grupo.addTo(map);
    infoPostos(desenhados);
  }

  function ancoraPostos() {
    if (state.nav.ativo && state.nav.ultimaPos) return state.nav.ultimaPos;
    return state.geo.ultima || null;
  }

  function infoPostos(desenhados) {
    if (!el.camadaPostosInfo) return;
    var total = state.postos.lista.length;
    if (state.postos.visao === 'perto' && state.postos.centro) {
      el.camadaPostosInfo.textContent = desenhados + ' de ' + total + ' num raio de 2 km';
    } else {
      el.camadaPostosInfo.textContent = total + ' postos \u00b7 Goi\u00e2nia';
    }
  }

  function redesenharPostos() {
    if (!state.postos.ligada) return;
    if (state.postos.camada) {
      map.removeLayer(state.postos.camada);
      state.postos.camada = null;
    }
    desenharPostos();
  }

  function aplicarVisaoPostos(visao) {
    state.postos.visao = (visao === 'todos') ? 'todos' : 'perto';
    if (el.postosVisaoPerto) {
      el.postosVisaoPerto.classList.toggle('chip--active', state.postos.visao === 'perto');
      el.postosVisaoPerto.setAttribute('aria-pressed', String(state.postos.visao === 'perto'));
    }
    if (el.postosVisaoTodos) {
      el.postosVisaoTodos.classList.toggle('chip--active', state.postos.visao === 'todos');
      el.postosVisaoTodos.setAttribute('aria-pressed', String(state.postos.visao === 'todos'));
    }
    redesenharPostos();
  }

  function desenharRadares() {
    if (!map) return;
    if (!state.radares.camada) {
      state.radares.camada = L.layerGroup().addTo(map);
    }
    state.radares.camada.clearLayers();
    if (!state.radares.ligada) return;
    carregarRadares().then(function () {
      (state.radares.lista || []).forEach(function (p) {
        if (p.lat == null || p.lon == null) return;
        var icone = L.divIcon({
          className: 'posto-wrap',
          html: '<div class="posto-chip posto--sem radar-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 5V3M12 21v-2M5 12H3M21 12h-2M7.05 7.05 5.64 5.64M18.36 18.36l-1.41-1.41M7.05 16.95l-1.41 1.41M18.36 5.64l-1.41 1.41"/></svg></div>',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          popupAnchor: [0, -18]
        });
        var m = L.marker([p.lat, p.lon], { icon: icone, clickable: true, zIndexOffset: 900 }).addTo(state.radares.camada);
        var html = '<div class="posto-pop"><b>Radar</b>' +
          (p.nome ? '<div class="posto-end">' + esc(p.nome) + '</div>' : '') +
          (p.endereco || p.rua ? '<div class="posto-end">' + esc(p.endereco || p.rua) + '</div>' : '') +
          '</div>';
        m.bindPopup(html);
      });
    });
  }


  function desenharSemaforos() {
    if (!map) return;
    if (!state.semaforos.camada) {
      state.semaforos.camada = L.layerGroup().addTo(map);
    }
    state.semaforos.camada.clearLayers();
    if (!state.semaforos.ligada) return;
    carregarSemaforos().then(function () {
      (state.semaforos.lista || []).forEach(function (p) {
        if (p.lat == null || p.lon == null) return;
        var icone = L.divIcon({
          className: 'posto-wrap',
          html: '<div class="posto-chip posto--sem semaforo-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="16" rx="2"/><circle cx="12" cy="6" r="1.6"/><circle cx="12" cy="10" r="1.6"/><circle cx="12" cy="14" r="1.6"/><rect x="11" y="18" width="2" height="4" rx="1"/></svg></div>',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          popupAnchor: [0, -18]
        });
        var m = L.marker([p.lat, p.lon], { icon: icone, clickable: true, zIndexOffset: 950 }).addTo(state.semaforos.camada);
        var html = '<div class="posto-pop"><b>Semaforo</b>' +
          (p.nome ? '<div class="posto-end">' + esc(p.nome) + '</div>' : '') +
          (p.endereco || p.rua ? '<div class="posto-end">' + esc(p.endereco || p.rua) + '</div>' : '') +
          '</div>';
        m.bindPopup(html);
      });
    });
  }


  function carregarRadares() {
    if (state.radares.lista.length || state.radares.pedido) return state.radares.pedido;
    state.radares.pedido = fetch('data/radares-go.json')
      .catch(function () { return fetch('data/postos-go.json'); })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        state.radares.lista = (d && d.postos) || (Array.isArray(d) ? d : []);
        if (el.camadaRadaresInfo) {
          el.camadaRadaresInfo.textContent = state.radares.lista.length + ' itens \u00b7 Goi\u00e1s';
        }
        return state.radares.lista;
      })
      .catch(function (err) {
        console.warn('radares nao carregados', err);
      });
    return state.radares.pedido;
  }


  function carregarSemaforos() {
    if (state.semaforos.lista.length || state.semaforos.pedido) return state.semaforos.pedido;
    state.semaforos.pedido = fetch('data/semaforos-go.json')
      .catch(function () { return fetch('data/postos-go.json'); })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        state.semaforos.lista = (d && d.postos) || (Array.isArray(d) ? d : []);
        if (el.camadaSemaforosInfo) {
          el.camadaSemaforosInfo.textContent = state.semaforos.lista.length + ' itens \u00b7 Goi\u00e1s';
        }
        return state.semaforos.lista;
      })
      .catch(function (err) {
        console.warn('semaforos nao carregados', err);
      });
    return state.semaforos.pedido;
  }

  function carregarPostos() {
    if (state.postos.lista.length || state.postos.pedido) return state.postos.pedido;
    state.postos.pedido = fetch('data/postos-go.json')
      .catch(function () { return fetch('data/postos-goiania.json'); })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        state.postos.lista = (d && d.postos) || (Array.isArray(d) ? d : []);
        aplicarPrecos(state.postos.lista);
        if (el.camadaPostosInfo) {
          el.camadaPostosInfo.textContent = state.postos.lista.length +
            (d && d.cidade ? ' postos \u00b7 ' + d.cidade : ' postos \u00b7 Goi\u00e1s');
        }
        return state.postos.lista;
      })
      .catch(function (err) {
        state.postos.pedido = null;
        if (el.camadaPostosInfo) el.camadaPostosInfo.textContent = 'falha ao carregar';
        showError('Nao consegui carregar os postos: ' + err.message);
        throw err;
      });
    return state.postos.pedido;
  }


  function ligarCamadaPostos() {
    state.postos.ligada = true;
    if (el.camadaFonte) el.camadaFonte.classList.remove('hidden');
    if (el.camadaPostosVisao) el.camadaPostosVisao.classList.remove('hidden');
    carregarPostos().then(function () {
      if (!state.postos.ligada) return;
      desenharPostos();
      if (!state.nav.ativo) iniciarWatchPostos();
    }).catch(function () {
      state.postos.ligada = false;
      if (el.camadaPostos) el.camadaPostos.checked = false;
      if (el.camadaFonte) el.camadaFonte.classList.add('hidden');
      if (el.camadaPostosVisao) el.camadaPostosVisao.classList.add('hidden');
    });
  }

  function ligarCamadaRadares() {
    state.radares.ligada = true;
    desenharRadares();
  }
  function desligarCamadaRadares() {
    state.radares.ligada = false;
    if (state.radares.camada) {
      map.removeLayer(state.radares.camada);
      state.radares.camada = null;
    }
  }
  function ligarCamadaSemaforos() {
    state.semaforos.ligada = true;
    desenharSemaforos();
  }
  function desligarCamadaSemaforos() {
    state.semaforos.ligada = false;
    if (state.semaforos.camada) {
      map.removeLayer(state.semaforos.camada);
      state.semaforos.camada = null;
    }
  }


  function desligarCamadaPostos() {
    state.postos.ligada = false;
    if (state.postos.camada) {
      map.removeLayer(state.postos.camada);
      state.postos.camada = null;
    }
    if (el.camadaFonte) el.camadaFonte.classList.add('hidden');
    if (el.camadaPostosVisao) el.camadaPostosVisao.classList.add('hidden');
    pararWatchPostos();
    esconderPostoPerto();
    state.postos.ultimo = null;
    state.postos.centro = null;
  }

  function iniciarWatchPostos() {
    // o watch de fundo ja alimenta checarPostoPerto a cada posicao; abrir
    // um segundo watch so duplicaria o custo de GPS e de bateria
    if (state.geo.watchId !== null) return;
    if (state.postos.watchId !== null || !navigator.geolocation) return;
    state.postos.watchId = navigator.geolocation.watchPosition(
      function (pos) {
        checarPostoPerto(pos.coords.latitude, pos.coords.longitude);
      },
      function () { /* sem aviso: a camada opcional nao deve incomodar */ },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
  }

  function pararWatchPostos() {
    if (state.postos.watchId !== null) {
      navigator.geolocation.clearWatch(state.postos.watchId);
      state.postos.watchId = null;
    }
  }

  function checarPostoPerto(lat, lon) {
    if (!state.postos.ligada || !state.postos.lista.length) return;
    var ant = state.postos.ultimo;
    if (ant && distanciaM(lat, lon, ant.lat, ant.lon) < POSTO_MIN_MOV) return;
    state.postos.ultimo = { lat: lat, lon: lon };

    // Visao "proximos": conforme o carro anda, o recorte de 2 km envelhece.
    // So redesenha depois de andar bastante, para nao refazer os pinos a toa.
    if (state.postos.visao === 'perto') {
      var c = state.postos.centro;
      if (!c || distanciaM(lat, lon, c.lat, c.lon) > POSTO_VISAO_MIN_MOV) redesenharPostos();
    }

    var melhor = null, menorD = Infinity;
    for (var i = 0; i < state.postos.lista.length; i++) {
      var p = state.postos.lista[i];
      if (p.lat == null || p.lon == null) continue;
      var d = distanciaM(lat, lon, p.lat, p.lon);
      if (d < menorD) { menorD = d; melhor = p; }
    }
    if (melhor && menorD <= RAIO_POSTO_M) mostrarPostoPerto(melhor, menorD);
    else esconderPostoPerto();
  }

  function mostrarPostoPerto(p, dist) {
    if (!el.postoPerto) return;
    state.postos.perto = p;
    state.postos.pertoDist = dist;
    var linhas = PRECOS_POSTO.map(function (par) {
      var v = p.precos && p.precos[par[0]];
      if (v == null) return '';
      return '<div class="pp-preco"><span>' + par[1] + '</span><b>' +
        precoCurto(v) + '</b></div>';
    }).join('');
    el.postoPerto.innerHTML =
      '<div class="pp-nome">' + esc(p.nome) +
        (p.bandeira ? '<em>' + esc(p.bandeira) + '</em>' : '') +
        '<span class="pp-dist">' + Math.round(dist) + ' m</span>' +
      '</div>' +
      '<div class="pp-precos">' +
        (linhas || '<em>Sem pre\u00e7os informados.</em>') +
        '<button type="button" class="pp-editar">Editar</button>' +
      '</div>';
    var btn = el.postoPerto.querySelector('.pp-editar');
    if (btn) btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      abrirEditorPosto(p);
    });
    el.postoPerto.classList.remove('hidden');
  }

  function esconderPostoPerto() {
    state.postos.perto = null;
    if (el.postoPerto) {
      el.postoPerto.classList.add('hidden');
      el.postoPerto.innerHTML = '';
    }
  }

  /* ------------------------------------------------------------------ *
   * Editor de precos do posto
   *
   * A base traz os precos da ANP, mas aquele numero pode estar velho. Quem
   * estiver na bomba digita o valor real e o dele passa a valer no chip do
   * mapa, no popup e no cartao do posto proximo (js/precos.js, guardado no
   * aparelho). Campo em branco volta para o valor da base. O botao
   * "verificado por 3 pessoas" ainda nao existe -- por ora o valor e local,
   * de cada aparelho.
   * ------------------------------------------------------------------ */

  function abrirEditorPosto(p) {
    if (!el.postoEdit || !p) return;
    state.postos.editando = p;
    if (el.postoEditNome) el.postoEditNome.textContent = p.nome || 'Posto';
    if (el.postoEditEnd) el.postoEditEnd.textContent = enderecoPosto(p) || '';
    if (el.postoEditCampos) {
      el.postoEditCampos.innerHTML = PRECOS_POSTO.map(function (par) {
        var v = p.precos && p.precos[par[0]];
        var val = (v == null) ? '' : String(v).replace('.', ',');
        return '<label class="pe-campo"><span>' + esc(par[1]) + '</span>' +
          '<input type="text" inputmode="decimal" autocomplete="off"' +
          ' data-preco="' + par[0] + '" placeholder="0,00" value="' + esc(val) + '">' +
          '</label>';
      }).join('');
    }
    el.postoEdit.classList.remove('hidden');
  }

  function fecharEditorPosto() {
    state.postos.editando = null;
    if (el.postoEdit) el.postoEdit.classList.add('hidden');
  }

  function salvarEditorPosto() {
    var p = state.postos.editando;
    if (!p || !el.postoEditCampos) { fecharEditorPosto(); return; }

    var valores = {};
    var campos = el.postoEditCampos.querySelectorAll('input[data-preco]');
    for (var i = 0; i < campos.length; i++) {
      var v = PRECOS ? PRECOS.normalizar(campos[i].value) : null;
      if (v != null) valores[campos[i].getAttribute('data-preco')] = v;
    }
    if (PRECOS) {
      PRECOS.definir(p.id, valores);
      p.precos = PRECOS.efetivo(p.id, p.precosBase || {});
    }

    fecharEditorPosto();

    // o chip (preco da comum) e o cartao do posto proximo mudam junto
    redesenharPostos();
    if (state.postos.perto && state.postos.perto.id === p.id) {
      mostrarPostoPerto(p, state.postos.pertoDist || 0);
    }
  }

  function fecharCamadas() {
    if (el.camadasPanel) el.camadasPanel.classList.add('hidden');
    if (el.btnEye) {
      el.btnEye.classList.remove('ativo');
      el.btnEye.setAttribute('aria-expanded', 'false');
    }
  }

  function alternarCamadas() {
    if (!el.camadasPanel) return;
    var aberto = !el.camadasPanel.classList.contains('hidden');
    if (aberto) {
      fecharCamadas();
    } else {
      fecharBasemap();
      el.camadasPanel.classList.remove('hidden');
      if (el.btnEye) {
        el.btnEye.classList.add('ativo');
        el.btnEye.setAttribute('aria-expanded', 'true');
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Tipo de mapa (base) -- botao logo abaixo do olho
   *
   * O seletor do Leaflet vivia no canto superior direito, dentro do
   * empilhamento do mapa, e a topbar flutuante passava por cima dele: dava
   * para ver uma fatia, mas nao para tocar. Aqui a lista e nossa e ocupa a
   * mesma coluna dos botoes flutuantes, ja com o tipo atual marcado.
   * ------------------------------------------------------------------ */

  function montarListaBasemaps() {
    if (!el.basemapList) return;
    el.basemapList.innerHTML = baseKeys.map(function (k) {
      return '<button type="button" class="basemap-item" data-basemap="' + esc(k) + '"' +
        ' aria-pressed="false">' +
        '<span class="basemap-check" aria-hidden="true">&#10003;</span>' +
        '<span class="basemap-nome">' + esc(k) + '</span>' +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(
      el.basemapList.querySelectorAll('.basemap-item'),
      function (btn) {
        btn.addEventListener('click', function () {
          trocarBasemap(btn.getAttribute('data-basemap'));
        });
      });
    marcarBasemapAtual();
  }

  function marcarBasemapAtual() {
    if (el.basemapList) {
      Array.prototype.forEach.call(
        el.basemapList.querySelectorAll('.basemap-item'),
        function (btn) {
          var on = btn.getAttribute('data-basemap') === baseAtual;
          btn.classList.toggle('ativo', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }
    if (el.btnBasemap) {
      el.btnBasemap.setAttribute('title', 'Tipo de mapa: ' + baseAtual);
      el.btnBasemap.setAttribute('aria-label', 'Tipo de mapa: ' + baseAtual);
    }
  }

  function trocarBasemap(chave) {
    if (!chave || !baseLayers[chave]) return;
    if (chave !== baseAtual) {
      map.removeLayer(baseLayers[baseAtual]);
      baseLayers[chave].addTo(map);
      baseAtual = chave;
      // reseta a contagem de erro: cada provedor tem o proprio padrao
      tileErros = 0;
      try { window.localStorage.setItem(CHAVE_BASEMAP, chave); } catch (e) { /* bloqueado */ }
    }
    marcarBasemapAtual();
    fecharBasemap();
  }

  function fecharBasemap() {
    if (el.basemapPanel) el.basemapPanel.classList.add('hidden');
    if (el.btnBasemap) {
      el.btnBasemap.classList.remove('ativo');
      el.btnBasemap.setAttribute('aria-expanded', 'false');
    }
  }

  function alternarBasemap() {
    if (!el.basemapPanel) return;
    var aberto = !el.basemapPanel.classList.contains('hidden');
    if (aberto) {
      fecharBasemap();
    } else {
      fecharCamadas();
      el.basemapPanel.classList.remove('hidden');
      if (el.btnBasemap) {
        el.btnBasemap.classList.add('ativo');
        el.btnBasemap.setAttribute('aria-expanded', 'true');
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Camadas da navegacao (percurso, sinal de manobra, bairro)
   * ------------------------------------------------------------------ */

  /* Mapa aproximado. Na navegacao o jogador tem de enxergar a manobra daqui;
   * o zoom do editor de rota serve para ver o trajeto inteiro, que e outra
   * coisa. So roda na primeira leitura, para nao brigar com quem mexer no
   * zoom depois. */
  function approximarNav(pos) {
    if (state.nav.zoomado) return;
    state.nav.zoomado = true;
    var alvo = (typeof CFG.navZoom === 'number') ? CFG.navZoom : 18;
    if (map.getZoom() < alvo) map.setView([pos.lat, pos.lon], alvo, { animate: false });
    // Recentraliza com o navOffsetY (se ligado) ja no zoom novo: alvoCamera
    // mede os pixels agora, entao a faixa acima do carro fica exatamente o
    // offset configurado. Sem offset o centro volta a ser o proprio carro.
    var centro = alvoCamera(pos);
    if (centro[0] !== pos.lat || centro[1] !== pos.lon) {
      map.setView(centro, map.getZoom(), { animate: false });
    }
  }

  /* Percurso: o trecho que ainda falta fica destacado em cima da rota
   * completa, comeca exatamente onde o carro esta e vai encolhendo a cada
   * leitura. E o "fazendo o percurso" do Waze/Maps: da para ver o que ja
   * passou (rota fina de trás) e o que falta (a parte grossa). */
  function atualizarPercurso(prep, perto) {
    var restante = NAV.geometriaRestante(prep, perto.along);

    if (!state.nav.percursoHalo) {
      state.nav.percursoHalo = L.polyline(restante, {
        color: corVar('--route-casing', '#3b0764'),
        weight: 17,
        opacity: .55,
        interactive: false,
        lineJoin: 'round',
        lineCap: 'round',
        smoothFactor: 1.5
      }).addTo(map);
      state.nav.percurso = L.polyline(restante, {
        color: corVar('--route', '#7c3aed'),
        weight: 11,
        opacity: 1,
        interactive: false,
        lineJoin: 'round',
        lineCap: 'round',
        smoothFactor: 1.5
      }).addTo(map);
      return;
    }

    state.nav.percursoHalo.setLatLngs(restante);
    state.nav.percurso.setLatLngs(restante);
  }

  /* Sinal de manobra no mapa: o chip com a setinha nasce na curva, na
   * estrada, para o motorista saber o que fazer antes de ler a faixa do
   * topo. Some apos a manobra, como a chevrou do Maps. */
  function atualizarManobra(prep, perto) {
    var prox = NAV.proximoPasso(prep, perto.along);
    var m = state.nav.manobra;

    // So interessa proximo: ver o chip para manobra a 5 km atrasa quem esta
    // lendo o caminho. Entra a 400 m, que cobre a faixa de aviso.
    if (!prox || prox.dist > 400 || restanteChegou(prep, perto)) {
      if (m) { map.removeLayer(m); state.nav.manobra = null; }
      return;
    }

    var ponto = NAV.pontoNaGeometria(prep, prox.passo.turnAt);
    if (!ponto) return;

    if (!m) {
      m = state.nav.manobra = L.marker(ponto, {
        interactive: false,
        zIndexOffset: 900,
        icon: L.divIcon({
          className: 'manobra-wrap',
          html: '<div class="manobra-sign"><span class="manobra-seta"></span></div>' +
                '<div class="manobra-rua"></div>',
          iconSize: [96, 46],
          iconAnchor: [48, 62]
        })
      }).addTo(map);
    } else {
      m.setLatLng(ponto);
    }

    var elMark = m.getElement();
    if (elMark) {
      var seta = elMark.querySelector('.manobra-seta');
      if (seta && seta.textContent !== prox.passo.icon) seta.textContent = prox.passo.icon;
      var rua = elMark.querySelector('.manobra-rua');
      var texto = prox.passo.street || '';
      if (rua && rua.textContent !== texto) {
        rua.textContent = texto;
        rua.classList.toggle('manobra-rua--vazio', !texto);
      }
    }
  }

  function restanteChegou(prep, perto) {
    return NAV.restante(prep, perto.along).chegou;
  }

  /* Bairro do momento. Sem isso o motorista sabe a manobra mas nao sabe
   * onde esta — em Goiania "Setor Bueno" vale mais que o nome da rua.
   *
   * O Nominatim tem limite de 1 pedido por segundo, entao so consulta
   * quando o carro andou uns 300 m. Parado ou andando devagar, o bairro
   * visivel nao muda e consultas so custariam cota e bateria. */
  function atualizarBairro(p) {
    if (!state.geo.bairroPos) {
      state.geo.bairroPos = { lat: p.lat, lon: p.lon };
      state.geo.bairroMs = Date.now();
    } else {
      var andou = NAV.haversine([state.geo.bairroPos.lat, state.geo.bairroPos.lon],
                                 [p.lat, p.lon]);
      var espera = Date.now() - state.geo.bairroMs;
      if (andou < 300 || espera < 5000 || state.geo.bairroPendente) return;
      state.geo.bairroPos = { lat: p.lat, lon: p.lon };
      state.geo.bairroMs = Date.now();
    }

    state.geo.bairroPendente = true;
    SVC.reverseBairro(p.lat, p.lon).then(function (bairro) {
      state.geo.bairroPendente = false;
      if (bairro && bairro !== state.geo.bairro) {
        state.geo.bairro = bairro;
        mostrarBalaoBairro(bairro);
      }
    }).catch(function () {
      state.geo.bairroPendente = false;
    });
  }

  /* GPS em segundo plano: fora da navegacao o app precisa de um watch
   * proprio para manter o retangulo de setor/bairro atualizado conforme
   * o usuario se desloca. E mais barato que o da navegacao: nao gira o
   * mapa, nao calcula manobra, so responde "onde estou". */
  /* Pilula de status do GPS. estado: 'busca' | 'ok' | 'fraco' | 'erro';
   * sem estado (ou null) a pilula some. */
  function mostrarGps(estado, texto) {
    if (!el.gpsStatus) return;
    if (!estado) {
      el.gpsStatus.className = 'gps-pill hidden';
      return;
    }
    el.gpsStatus.className = 'gps-pill gps-pill--' + estado;
    el.gpsStatus.textContent = texto || '';
  }

  function statusGpsDaPosicao(acc) {
    var n = Math.round(acc);
    if (!isFinite(n) || n <= 0) return mostrarGps('ok', 'GPS ativo');
    if (n > 80) return mostrarGps('fraco', 'Sinal fraco \u00b1' + n + ' m');
    mostrarGps('ok', 'GPS \u00b1' + n + ' m');
  }

  // zoom com que o mapa abre em cima da pessoa, igual ao botao "centralizar"
  var ZOOM_INICIAL = 16;

  /* Primeira leitura de GPS: leva o mapa para a posicao da pessoa como se
   * ela tivesse tocado no "centralizar". E uma vez so e, se ela ja tiver
   * mexido no mapa antes do primeiro fixo, deixa como esta (o listener de
   * dragstart/zoomstart marca centralizado). */
  function centralizarNoInicio(p) {
    if (state.geo.centralizado) return;
    state.geo.centralizado = true;
    map.setView([p.lat, p.lon], ZOOM_INICIAL, { animate: false });
  }

  function iniciarWatchGeo() {
    if (state.geo.watchId !== null || !navigator.geolocation) {
      if (!navigator.geolocation) mostrarGps('erro', 'Sem GPS');
      return;
    }
    mostrarGps('busca', 'Localizando\u2026');
    state.geo.watchId = navigator.geolocation.watchPosition(
      function (pos) {
        var p = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy,
          vel: pos.coords.speed,
          dir: pos.coords.heading
        };
        if (!state.nav.ativo) statusGpsDaPosicao(p.acc);
        state.geo.ultima = p;
        // a navegacao tem o GPS nativo; este so cobre o modo comum
        if (!state.nav.ativo) {
          posicionarUsuario(p);
          checarPostoPerto(p.lat, p.lon);
          centralizarNoInicio(p);
        }
        atualizarBairro(p);
      },
      function (err) {
        // sem sinal: a pilula avisa; o resto do app fica quieto
        if (!state.nav.ativo) {
          mostrarGps('erro', (err && err.code === 1) ? 'GPS bloqueado' : 'Sem sinal');
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 }
    );
  }

  function pararWatchGeo() {
    if (state.geo.watchId !== null) {
      navigator.geolocation.clearWatch(state.geo.watchId);
      state.geo.watchId = null;
    }
  }

  function limparCamadasNav() {
    [state.nav.percursoHalo, state.nav.percurso, state.nav.manobra].forEach(function (l) {
      if (l) map.removeLayer(l);
    });
    state.nav.percursoHalo = null;
    state.nav.percurso = null;
    state.nav.manobra = null;
    state.nav.zoomado = false;
    state.nav.meDir = null;
  }

  // Manobras de reta (Valhalla 7/8/22): a setinha de cima nao diz nada
  // novo -- o chip some e o texto vira um "Siga em frente" limpo. O tipo 25
  // (kMerge, entroncamento) fica de fora: ali ha sim uma seta a mostrar.
  var TIPOS_RETA = { 7: 1, 8: 1, 22: 1 };

  function renderHud(perto, rest, prox) {
    if (!el.navHud || el.navHud.classList.contains('hidden')) return;

    if (prox) {
      var reto = !!TIPOS_RETA[prox.passo.type];
      el.navHudIcon.classList.toggle('hidden', reto);
      if (reto) {
        el.navHudText.textContent = 'Siga em frente';
      } else {
        el.navHudIcon.innerHTML = esc(prox.passo.icon);
        el.navHudText.textContent = prox.passo.instruction || 'Siga em frente';
      }
      el.navHudStreet.textContent = prox.passo.street || '';
      el.navHudDist.textContent = prox.dist < 950
        ? Math.round(prox.dist / 10) * 10 + ' m'
        : fmtKm(prox.dist / 1000);
    } else {
      el.navHudIcon.classList.remove('hidden');
      el.navHudIcon.innerHTML = '&#9873;'; // bandeirinha de chegada
      el.navHudText.textContent = 'Siga ate o destino';
      el.navHudStreet.textContent = state.destination ? state.destination.label : '';
      el.navHudDist.textContent = rest.dist < 950
        ? Math.round(rest.dist / 10) * 10 + ' m'
        : fmtKm(rest.dist / 1000);
    }

    var pedacos = [fmtKm(rest.dist / 1000) + ' restantes', fmtMin(rest.seg)];
    if (perto && perto.dist > LIMITE_DESVIO_M) pedacos.push('fora da rota');
    el.navHudRemain.textContent = pedacos.join(' \u00b7 ');

    // Hora prevista de chegada (ETA) e velocidade atual, estilo Waze.
    if (el.navBarEta) {
      var eta = new Date(Date.now() + rest.seg * 1000);
      el.navBarEta.textContent =
        ('0' + eta.getHours()).slice(-2) + ':' + ('0' + eta.getMinutes()).slice(-2);
    }
    atualizarVelocidade(state.nav.ultimaPos);

    // Uma linha de status substitui o aviso assim que a navegacao engatou.
    if (state.nav.offDesde && perto && perto.dist <= LIMITE_DESVIO_M) navAviso(null);
  }

  function atualizarVelocidade(p) {
    if (!el.navSpeedVal) return;
    var kmh = p && p.vel && p.vel > 0.3 ? Math.round(p.vel * 3.6) : 0;
    el.navSpeedVal.textContent = kmh;
  }

  function replanejar() {
    var p = state.nav.ultimaPos;
    if (!p) return;
    navAviso('Voce saiu da rota. Recalculando a partir da sua posicao...', true);
    state.origin = { lat: p.lat, lon: p.lon, label: 'Minha posicao' };
    el.origin.value = 'Minha posicao';
    state.nav.falados = {};
    state.nav.offDesde = 0;
    clearTimeout(routeTimer);
    calculateRoute();
  }

  function abrirGpsExterno() {
    var d = state.destination;
    if (!d) {
      showError('Escolha um destino primeiro.');
      return;
    }
    NAV.abrirExterno(d).catch(function (err) {
      navAviso(err.message || 'Nao foi possivel abrir o GPS do aparelho.', true);
    });
  }

  /* ------------------------------------------------------------------ *
   * Configuracoes (engrenagem)
   * ------------------------------------------------------------------ */

  function abrirSettings() {
    state.settingsOpen = true;
    el.settingsPanel.classList.remove('hidden');
    el.settingsOverlay.classList.remove('hidden');
    el.btnSettings.setAttribute('aria-expanded', 'true');
    renderSettings();
  }

  function fecharSettings() {
    state.settingsOpen = false;
    el.settingsPanel.classList.add('hidden');
    el.settingsOverlay.classList.add('hidden');
    el.btnSettings.setAttribute('aria-expanded', 'false');
  }

  /* Le o estado salvo, aplica no CFG e devolve ja normalizado. */
  function carregarSettings() {
    var st = SET.apply(SET.load());
    state.settings = st;
    state.profile = st.activeProfile;
    state.showFare = st.showFare;
    if (st.surgeOptions.indexOf(state.surge) === -1) state.surge = st.surgeOptions[0];
    aplicarRecursos();
    return st;
  }

  /* Espelha os interruptores de recurso no estado da tela. */
  function aplicarRecursos() {
    el.btnFare.setAttribute('aria-pressed', state.showFare ? 'true' : 'false');
    el.btnFare.classList.toggle('toggle--on', state.showFare);
    el.fareOpts.classList.toggle('hidden', !state.showFare);

    if (camposAvancados) {
      camposAvancados.classList.toggle('hidden',
        !(state.settings && state.settings.advancedFields));
    }

    if (state.routes.length) {
      el.stepsSection.classList.toggle('hidden',
        !state.settings || !state.settings.showSteps);
    }
    var fareBar = document.querySelector('.fare-bar');
    if (fareBar) fareBar.classList.toggle('hidden', !(state.settings && state.showFare));
  }

  /* Grava, aplica e reflete na tela principal. */
  function salvarSettings(mut) {
    if (!state.settings) carregarSettings();

    var bruto = JSON.parse(JSON.stringify(state.settings));
    mut(bruto);
    var st = SET.apply(SET.save(bruto));
    state.settings = st;
    state.profile = st.activeProfile;
    state.showFare = st.showFare;
    if (st.surgeOptions.indexOf(state.surge) === -1) state.surge = st.surgeOptions[0];
    aplicarRecursos();
    renderProfileChips();
    renderSurgeChips();
    renderSettings();
    renderSummary();
  }

  function renderSettings() {
    var st = state.settings;
    if (!st) return;

    el.setProfileChips.innerHTML = Object.keys(CFG.fare.profiles).map(function (key) {
      var active = (key === st.activeProfile) ? ' chip--active' : '';
      return '<button type="button" class="chip' + active + '" data-set-profile="' + key + '">' +
        esc(CFG.fare.profiles[key].label) + '</button>';
    }).join('');

    Array.prototype.forEach.call(el.setProfileChips.querySelectorAll('.chip'), function (btn) {
      btn.addEventListener('click', function () {
        salvarSettings(function (s) { s.activeProfile = btn.getAttribute('data-set-profile'); });
      });
    });

    // o editor so aparece quando a tabela personalizada esta em uso
    var isCustom = st.activeProfile === 'custom';
    el.setCustom.classList.toggle('hidden', !isCustom);

    // interruptores de recurso
    el.setShowFare.checked = st.showFare;
    el.setShowSteps.checked = st.showSteps;
    el.setAutoRoute.checked = st.autoRoute;
    el.setSnap.checked = st.snapToRoad;
    if (el.setAdvancedFields) el.setAdvancedFields.checked = st.advancedFields;

    el.setSurge.value = st.surgeOptions.map(numBr).join(', ');
    el.setAlternatives.value = st.alternatives;
    if (el.setNavZoom) el.setNavZoom.value = st.navZoom;
    if (el.setNavOffsetY) el.setNavOffsetY.value = st.navOffsetY;
  el.setGeoapifyKey.value = st.geoapifyKey || '';

    if (!isCustom) return;

    SET_NUM.forEach(function (chave) {
      var input = document.getElementById('set-' + chave);
      if (input && document.activeElement !== input) input.value = st.custom[chave];
    });
    if (document.activeElement !== el.setLabel) el.setLabel.value = st.custom.label;

    var fareBar = document.querySelector('.fare-bar');
    if (fareBar) fareBar.classList.toggle('hidden', !(st && st.showFare));
    renderSettingsPreview();
  }

  /* mostra o que a tabela personalizada da na rota atual (ou num exemplo) */
  function renderSettingsPreview() {
    var st = state.settings;
    if (!st || st.activeProfile !== 'custom') return;

    var rota = state.routes[state.active];
    var km = rota ? rota.distanceKm : 5;
    var min = rota ? rota.durationSec / 60 : 20;
    var f = SVC.estimateFare(
      { distanceKm: km, durationSec: min * 60 },
      { profile: 'custom', surge: 1 }
    );

    el.setPreview.innerHTML =
      '<div class="set-preview-head">Testando ' + brl(km) + ' / ' + Math.round(min) + ' min</div>' +
      '<div class="set-preview-row"><span>Partida + km + tempo</span><span>' + brl(f.trip) + '</span></div>' +
      (f.minApplied
        ? '<div class="set-preview-note">Tarifa minima de ' + brl(SVC.fareProfile('custom').minFare) + ' aplicada</div>'
        : '') +
      '<div class="set-preview-row"><span>Intermediario (' + f.feePercent + '%)</span>' +
      '<span>' + brl(f.fee) + '</span></div>' +
      '<div class="set-preview-row set-preview-row--total"><span>Total</span>' +
      '<span>' + brl(f.total) + '</span></div>' +
      (rota ? '' : '<div class="set-preview-note">Sem rota calculada: exemplo de 5 km / 20 min.</div>');
  }

  el.btnSettings.addEventListener('click', function () {
    state.settingsOpen ? fecharSettings() : abrirSettings();
  });
  el.btnSettingsClose.addEventListener('click', fecharSettings);
  el.btnSettingsDone.addEventListener('click', fecharSettings);
  el.settingsOverlay.addEventListener('click', fecharSettings);

  el.btnSettingsReset.addEventListener('click', function () {
    var st = SET.apply(SET.clear());
    state.settings = st;
    state.profile = st.activeProfile;
    state.showFare = st.showFare;
    state.surge = st.surgeOptions[0];
    aplicarRecursos();
    renderProfileChips();
    renderSurgeChips();
    renderSettings();
    renderSummary();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && state.settingsOpen) fecharSettings();
  });

  // cada campo numerico da tarifa personalizada
  SET_NUM.forEach(function (chave) {
    var input = document.getElementById('set-' + chave);
    if (!input) return;
    input.addEventListener('change', function () {
      salvarSettings(function (s) { s.custom[chave] = input.value; });
    });
  });

  el.setLabel.addEventListener('change', function () {
    salvarSettings(function (s) { s.custom.label = el.setLabel.value; });
  });

  el.setSurge.addEventListener('change', function () {
    salvarSettings(function (s) {
      s.surgeOptions = el.setSurge.value.split(/[,\s]+/).filter(Boolean);
    });
  });

  el.setAlternatives.addEventListener('change', function () {
    salvarSettings(function (s) { s.alternatives = el.setAlternatives.value; });
  });

  if (el.setNavZoom) {
    el.setNavZoom.addEventListener('change', function () {
      salvarSettings(function (s) { s.navZoom = el.setNavZoom.value; });
    });
  }
  if (el.setNavOffsetY) {
    el.setNavOffsetY.addEventListener('change', function () {
      salvarSettings(function (s) { s.navOffsetY = el.setNavOffsetY.value; });
    });
  }

  // chave do provedor: entra na busca, mas so como ultima opcao
  el.setGeoapifyKey.addEventListener('change', function () {
    salvarSettings(function (s) { s.geoapifyKey = el.setGeoapifyKey.value.trim(); });
  });

  Object.keys(SET_BOOL).forEach(function (id) {
    var input = el[id];
    if (!input) return;
    var chave = SET_BOOL[id];
    input.addEventListener('change', function () {
      salvarSettings(function (s) { s[chave] = input.checked; });
    });
  });

  /* ------------------------------------------------------------------ *
   * Botoes
   * ------------------------------------------------------------------ */

  el.btnRoute.addEventListener('click', function () {
    clearTimeout(routeTimer);
    hideSuggestions();
    calculateRoute();
  });

  el.btnSwap.addEventListener('click', function () {
    var o = state.origin, d = state.destination;
    state.origin = d; state.destination = o;

    var vo = el.origin.value, vd = el.destination.value;
    el.origin.value = vd; el.destination.value = vo;

    updateMarkers();
    clearTimeout(routeTimer);
    calculateRoute();
  });

  el.btnClear.addEventListener('click', function () {
    state.origin = null;
    state.destination = null;
    state.routes = [];
    state.active = 0;
    state.picking = null;
    el.origin.value = '';
    el.destination.value = '';
    clearRouteLayers();
    clearError();
    setHint(null);
    hideSuggestions();
    hideResults();
    updateMarkers();
  });

  el.btnFare.addEventListener('click', function () {
    // o interruptor na engrenagem e o botao sao o mesmo recurso: usar
    // qualquer um dos dois grava a preferencia
    salvarSettings(function (s) { s.showFare = !state.showFare; });
  });

  // guardado: se o botao sair do HTML (regra de layout), nao pode derrubar
  // todo o restante do arquivo num TypeError de addEventListener(null).
  if (el.btnLocateMe) el.btnLocateMe.addEventListener('click', function () {
    clearError();
    currentPosition().then(function (pos) {
      map.setView([pos.lat, pos.lon], 16);
      return SVC.reverseGeocode(pos.lat, pos.lon).then(function (label) {
        if (!state.origin) {
          setPoint('origin', pos.lat, pos.lon, label);
          el.origin.value = label;
          updateMarkers();
        }
        scheduleRoute();
      });
    }).catch(function (err) {
      showError(err.message);
    });
  });

  Array.prototype.forEach.call(
    document.querySelectorAll('[data-act]'),
    function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-act');
        var field = btn.getAttribute('data-field');
        if (act === 'locate') useMyLocation(field);
        if (act === 'pick') startPicking(field);
      });
    }
  );
  
  if (el.btnWhere) {
    el.btnWhere.addEventListener('click', function () {
      openSearchScreen('destination');
    });
  }
  if (el.btnWhereFloat) {
    el.btnWhereFloat.addEventListener('click', function () {
      openSearchScreen('destination');
    });
  }
  if (el.btnPanel) {
    el.btnPanel.addEventListener('click', alternarPainel);
  }
  if (el.btnPanelClose) {
    el.btnPanelClose.addEventListener('click', fecharPainel);
  }

  // Favoritos: abrir/fechar a lista e responder o card de chegada
  if (el.btnFav) el.btnFav.addEventListener('click', alternarFavoritos);
  if (el.favAskSim) {
    el.favAskSim.addEventListener('click', function () {
      if (state.destination && window.NAV_FAVORITOS) {
        NAV_FAVORITOS.add({
          nome: state.destination.label,
          lat: state.destination.lat,
          lon: state.destination.lon
        });
      }
      esconderPerguntaFavorito();
      navAviso('Destino salvo nos favoritos.');
    });
  }
  if (el.favAskNao) {
    el.favAskNao.addEventListener('click', function () {
      esconderPerguntaFavorito();
      navAviso('Voce chegou.');
    });
  }
  // clique fora fecha a lista de favoritos
  document.addEventListener('click', function (ev) {
    if (!el.favList || el.favList.classList.contains('hidden')) return;
    if (el.favList.contains(ev.target)) return;
    if (el.btnFav && el.btnFav.contains(ev.target)) return;
    fecharFavoritos();
  });
  if (el.btnTheme) {
    el.btnTheme.addEventListener('click', alternarTema);
  }

  // Botao do "olho": abre/fecha o seletor do que mostrar no mapa
  if (el.btnEye) el.btnEye.addEventListener('click', alternarCamadas);
  if (el.camadasClose) el.camadasClose.addEventListener('click', fecharCamadas);

  // Tipo de mapa: botao logo abaixo do olho (o do Leaflet ficava atras da
  // topbar e nao dava para tocar)
  if (el.btnBasemap) el.btnBasemap.addEventListener('click', alternarBasemap);
  if (el.basemapClose) el.basemapClose.addEventListener('click', fecharBasemap);
  montarListaBasemaps();
  if (el.camadaRadares) {
    el.camadaRadares.addEventListener('change', function () {
      if (el.camadaRadares.checked) ligarCamadaRadares();
      else desligarCamadaRadares();
    });
  }
  if (el.camadaSemaforos) {
    el.camadaSemaforos.addEventListener('change', function () {
      if (el.camadaSemaforos.checked) ligarCamadaSemaforos();
      else desligarCamadaSemaforos();
    });
  }

  if (el.postosVisaoPerto) {
    el.postosVisaoPerto.addEventListener('click', function () { aplicarVisaoPostos('perto'); });
  }
  if (el.postosVisaoTodos) {
    el.postosVisaoTodos.addEventListener('click', function () { aplicarVisaoPostos('todos'); });
  }

  // Editor de precos do posto: salvar, cancelar, fechar no "x" ou no fundo.
  if (el.postoEditSalvar) el.postoEditSalvar.addEventListener('click', salvarEditorPosto);
  if (el.postoEditCancelar) el.postoEditCancelar.addEventListener('click', fecharEditorPosto);
  if (el.postoEditClose) el.postoEditClose.addEventListener('click', fecharEditorPosto);
  if (el.postoEdit) {
    el.postoEdit.addEventListener('click', function (ev) {
      if (ev.target === el.postoEdit) fecharEditorPosto();
    });
  }

  // Qualquer mexida do usuario no mapa desliga o "centralizar no inicio":
  // quem arrastou/zoomou antes do primeiro GPS nao quer ser teleportado.
  map.on('dragstart', function () { state.geo.centralizado = true; });
  map.on('zoomstart', function () { state.geo.centralizado = true; });
  
  // Navegacao: escolher o GPS do aparelho ou guiar dentro do app
  el.navExternal.addEventListener('click', abrirGpsExterno);
  el.navStart.addEventListener('click', iniciarNavegacao);
  el.navStop.addEventListener('click', cancelarRota);
  if (el.navCancel) el.navCancel.addEventListener('click', cancelarRota);
  el.navMute.addEventListener('click', alternarVoz);
  if (el.navMenu) el.navMenu.addEventListener('click', alternarPainel);
  
  // Busca full-screen: nao entra aqui, ja foi ligado acima; garante fechamento no ESC global
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (el.postoEdit && !el.postoEdit.classList.contains('hidden')) {
        fecharEditorPosto();
        return;
      }
      if (el.searchScreen && !el.searchScreen.classList.contains('hidden')) {
        closeSearchScreen();
        return;
      }
      if (el.basemapPanel && !el.basemapPanel.classList.contains('hidden')) {
        fecharBasemap();
        return;
      }
      if (el.camadasPanel && !el.camadasPanel.classList.contains('hidden')) {
        fecharCamadas();
      }
    }
  });

  // Fechar o app durante a navegacao deixaria o foreground service ligado
  // sem ninguem consumindo as posicoes; o beforeunload cobre esse caso.
  window.addEventListener('beforeunload', function () {
    if (state.nav.ativo && state.nav.ponte) state.nav.ponte.parar();
  });

  // Enter em qualquer campo dispara o calculo
  [el.origin, el.destination].forEach(function (input) {
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        hideSuggestions();
        clearTimeout(routeTimer);
        calculateRoute();
      }
    });
  });

  document.addEventListener('click', function (ev) {
    if (!el.suggestions.contains(ev.target)) hideSuggestions();
  });

  // Carrega as configuracoes salvas logo na execucao do script, e nao so no
  // DOMContentLoaded: assim a engrenagem ja funciona se for clicada antes.
  carregarSettings();

  // um clique de exemplo para testar rapido
  window.addEventListener('DOMContentLoaded', function () {
    updateMarkers();
    hideResults();
    renderProfileChips();
    renderSurgeChips();
    criarMarcadorUsuario();
    aplicarTema(temaSalvo());
    recolorirMapa();
    // retangulo de setor/bairro: o app pede localizacao logo de cara, como
    // o Waze. Se o usuario negar, o watch simplesmente nao dispara.
    iniciarWatchGeo();
    // App de rota: a tela fica acesa enquanto o app estiver aberto. No
    // Android vira FLAG_KEEP_SCREEN_ON; no navegador tenta a Wake Lock API.
    NAV.ponte().ligarTelaSempre();
  });

  map.invalidateSize();

})();