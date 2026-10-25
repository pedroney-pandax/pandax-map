/* Camada de navegacao: geometria da rota e ponte com o GPS.
 *
 * Duas metades, de proposito separadas:
 *
 *  1. Matematica pura (haversine, cumulativos, maisPerto, proximoPasso).
 *     Nao toca em DOM, GPS nem navegador, da para testar direto no Node.
 *
 *  2. Ponte de GPS e voz. No navegador usa watchPosition e
 *     speechSynthesis; dentro do app Android usa o plugin NavGuide, que
 *     roda num foreground service e fala pelo TextToSpeech do sistema.
 *     O resto do app so conhece a interface daqui e nao sabe em qual
 *     plataforma esta rodando.
 */

(function () {
  'use strict';

  var R_TERRA = 6371000; // metros

  /* ------------------------------------------------------------------ *
   * 1. Matematica pura
   * ------------------------------------------------------------------ */

  /** Distancia em metros entre dois pontos [lat, lon]. */
  function haversine(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad;
    var dLon = (b[1] - a[1]) * rad;
    var la1 = a[0] * rad;
    var la2 = b[0] * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_TERRA * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /** Metros acumulados ate cada ponto da geometria. */
  function cumulativos(geometry) {
    var out = new Array(geometry.length);
    out[0] = 0;
    for (var i = 1; i < geometry.length; i++) {
      out[i] = out[i - 1] + haversine(geometry[i - 1], geometry[i]);
    }
    return out;
  }

  /**
   * Projeta o usuario sobre a rota e devolve onde ele esta ao longo dela.
   * dist e a distancia ate a linha (serve para detectar desvio) e along
   * e quantos metros da rota ja foram percorridos (serve para achar a
   * proxima manobra).
   */
  function maisPerto(geometry, cums, lat, lon) {
    var melhor = { dist: Infinity, along: 0, indice: 0, t: 0 };

    // Plano local: lon corrigido pelo cos da latitude. Num trecho de rota
    // (centenas de metros) a diferenca em relacao a haversine e irrelevante,
    // e da para projetar com algebra simples.
    var kx = Math.cos(lat * Math.PI / 180) * 111320;
    var ky = 110540;
    var px = lon * kx;
    var py = lat * ky;

    for (var i = 0; i < geometry.length - 1; i++) {
      var ax = geometry[i][1] * kx, ay = geometry[i][0] * ky;
      var bx = geometry[i + 1][1] * kx, by = geometry[i + 1][0] * ky;
      var dx = bx - ax, dy = by - ay;
      var len2 = dx * dx + dy * dy;

      var t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      if (t < 0) t = 0;
      if (t > 1) t = 1;

      var cx = ax + t * dx, cy = ay + t * dy;
      var d = Math.hypot(px - cx, py - cy);

      if (d < melhor.dist) {
        melhor.dist = d;
        melhor.along = cums[i] + t * (cums[i + 1] - cums[i]);
        melhor.indice = i;
        melhor.t = t;
      }
    }

    return melhor;
  }

  /**
   * Prepara a rota ativa para ser navegada.
   *
   * ATENCAO UNIDADE: steps[].distance e steps[].cumulative vem do Valhalla em
   * QUILOMETROS (o mesmo padrao de route.distanceKm), enquanto a geometria e
   * medida em METROS pelo cumulativos(). Misturar as duas e o que faz o app
   * anunciar manobra no lugar errado, entao a conversao e feita aqui uma
   * vez so.
   *
   * E o Valhalla mede a manobra pela propria malha viaria, que bate quase
   * igual com a polyline, mas nao exato. O fator k corrige a diferenca e
   * coloca as duas medidas na mesma regua. Se a divergencia for grande demais
   * para confiar (dados corrompidos, provedor trocado), melhor usar k = 1 e
   * errar pouco do que errar muito.
   */
  function prepararRota(route) {
    var geometry = (route && route.geometry) || [];
    var cums = cumulativos(geometry);
    var total = cums.length ? cums[cums.length - 1] : 0;
    var steps = (route && route.steps) || [];

    var ultimoKm = steps.length ? (steps[steps.length - 1].cumulative || 0) : 0;
    var ultimoM = ultimoKm * 1000;
    var k = 1;
    if (ultimoM > 0 && total > 0) {
      var bruto = total / ultimoM;
      // So aceita ajuste de ate 2x. Alem disso o dado nao confia.
      if (bruto > 0.5 && bruto < 2) k = bruto;
    }

    var passos = steps.map(function (s) {
      var dist = (s.distance || 0) * 1000 * k;
      // Semantica do Valhalla: length e o trecho PERCORRIDO antes da
      // manobra. Ou seja, a curva acontece no FIM do trecho, na posicao
      // cumulative, e nao no comeco. Errar essa leitura faz o aviso cair
      // uma manobra adiantado, ou em cima de quem voce ja passou.
      var turnAt = (s.cumulative || 0) * 1000 * k;
      var inicio = turnAt - dist;
      return {
        type: s.type,
        icon: s.icon,
        instruction: s.instruction,
        street: s.street,
        distance: dist,  // comprimento do trecho, em metros
        inicio: inicio,  // comeco do trecho, em metros
        turnAt: turnAt   // onde a manobra acontece, em metros
      };
    });

    return {
      geometry: geometry,
      cums: cums,
      total: total,
      passos: passos,
      duracaoSec: (route && route.durationSec) || 0,
      fator: k
    };
  }

  /**
   * Passo em execucao, isto e, a manobra para a qual voce esta se dirigindo.
   *
   * Como a manobra acontece no FIM do trecho (turnAt), a resposta e o
   * primeiro passo cujo turnAt ainda esta a frente. No comeco da rota, com
   * voce ainda antes da primeira curva, isso ja devolve o passo 0, que e o
   * que voce quer ouvir: "siga para o norte".
   *
   * Devolve null quando passou da ultima, ou seja, voce chegou.
   */
  function proximoPasso(prep, alongM) {
    for (var i = 0; i < prep.passos.length; i++) {
      var p = prep.passos[i];
      if (p.turnAt > alongM + 0.5) {
        return { passo: p, indice: i, dist: p.turnAt - alongM };
      }
    }
    return null;
  }

  /** Metros que faltam ate o destino, e tempo estimado do que falta. */
  function restante(prep, alongM) {
    var dist = Math.max(0, prep.total - alongM);
    var frac = prep.total > 0 ? (dist / prep.total) : 0;
    return {
      dist: dist,
      seg: prep.duracaoSec * frac,
      chegou: dist <= 25 || frac <= 0.005
    };
  }

  /* ------------------------------------------------------------------ *
   * 2. Ponte de GPS e voz
   * ------------------------------------------------------------------ */

  function pluginNativo() {
    if (typeof window === 'undefined' || !window.Capacitor) return null;
    var plugins = window.Capacitor.Plugins || {};
    return plugins.NavGuide || (window.plugins && window.plugins.NavGuide) || null;
  }

  function ehNativo() {
    return typeof window !== 'undefined'
      && window.Capacitor
      && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform()
      && !!pluginNativo();
  }

  /* --- no navegador --- */

  var web = {
    watchId: null,
    callbacks: [],

    _emit: function (p) {
      this.callbacks.forEach(function (cb) {
        try { cb(p); } catch (e) { /* um listener ruim nao derruba o GPS */ }
      });
    },

    iniciar: function () {
      var self = this;
      if (this.watchId !== null) return Promise.resolve();
      if (!navigator.geolocation) {
        return Promise.reject(new Error('Este dispositivo nao tem geolocalizacao.'));
      }
      return new Promise(function (resolve, reject) {
        self.watchId = navigator.geolocation.watchPosition(
          function (pos) {
            self._emit({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              vel: pos.coords.speed || 0,
              dir: pos.coords.heading || 0,
              acc: pos.coords.accuracy || 0
            });
          },
          function (err) {
            var msgs = {
              1: 'Permissao de localizacao negada.',
              2: 'Sinal GPS indisponivel. Tente ao ar livre.',
              3: 'O GPS demorou demais para responder.'
            };
            reject(new Error(msgs[err.code] || 'Falha no GPS.'));
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
        resolve();
      });
    },

    parar: function () {
      if (this.watchId !== null) {
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
      return Promise.resolve();
    },

    falar: function (texto) {
      if (typeof speechSynthesis === 'undefined' || !speechSynthesis) return;
      speechSynthesis.cancel();
      var fala = new SpeechSynthesisUtterance(texto);
      fala.lang = 'pt-BR';
      // As vozes carregam de forma assincrona; sem esperar a lista, o
      // navegador costuma cair na voz padrao em ingles.
      var escolher = function () {
        var vozes = speechSynthesis.getVoices() || [];
        var pt = vozes.filter(function (v) { return /pt[-_]?BR/i.test(v.lang); })[0]
          || vozes.filter(function (v) { return /^pt/i.test(v.lang); })[0];
        if (pt) fala.voice = pt;
      };
      escolher();
      if (typeof speechSynthesis.onvoiceschanged !== 'undefined') {
        speechSynthesis.onvoiceschanged = escolher;
      }
      speechSynthesis.speak(fala);
    },

    pararFala: function () {
      if (typeof speechSynthesis !== 'undefined' && speechSynthesis) speechSynthesis.cancel();
    },

    mudo: function () { this.pararFala(); }
  };

  /* --- dentro do app Android --- */

  function nativo() {
    var g = pluginNativo();

    return {
      iniciar: function (opts) {
        return g.iniciar({ texto: (opts && opts.texto) || 'Navegando' });
      },
      parar: function () { return g.parar(); },
      falar: function (texto) { return g.falar({ texto: texto }); },
      pararFala: function () { return g.pararFala(); },
      mudo: function (v) { return g.mudo({ valor: !!v }); },
      vibrar: function (ms) { return g.vibrar({ ms: ms }); },
      aoPosicionar: function (cb) { g.addListener('posicao', cb); },

      /**
       * Tela sempre ligada: app de rota nao pode apagar no meio do caminho.
       * No Android vira FLAG_KEEP_SCREEN_ON na janela atual.
       */
      ligarTelaSempre: function () {
        return typeof g.manterAcordado === 'function'
          ? g.manterAcordado().catch(function () { })
          : Promise.resolve();
      },
      desligarTelaSempre: function () {
        return typeof g.liberarAcordado === 'function'
          ? g.liberarAcordado().catch(function () { })
          : Promise.resolve();
      },

      /**
       * Avisos que o nativo manda sozinho e que o usuario precisa ver: falta
       * motor de voz em portugues, ou negada a permissao de notificacao. Sem
       * isto o app navega em silencio e parece simplesmente quebrado.
       */
      aoAvisar: function (cb) {
        g.addListener('semVoz', function (d) {
          cb((d && d.aviso) || 'Este aparelho nao tem voz em portugues instalado.');
        });
        g.addListener('semNotificacao', function (d) {
          cb((d && d.aviso) || 'Sem permissao de notificacao, nada aparece na barra.');
        });
      }
    };
  }

  function ponte() {
    if (ehNativo()) return nativo();
    return {
      iniciar: function (o) { return web.iniciar(o); },
      parar: function () { return web.parar(); },
      falar: function (t) { web.falar(t); return Promise.resolve(); },
      pararFala: function () { web.pararFala(); return Promise.resolve(); },
      mudo: function (v) { web.mudo(v); return Promise.resolve(); },
      aoPosicionar: function (cb) { web.callbacks.push(cb); },
      // No navegador nao ha como segurar a tela: algumas plataformas tem
      // Wake Lock API, mas o suporte e irregular. O app Android e o alvo.
      ligarTelaSempre: function () {
        try {
          if (navigator.wakeLock && navigator.wakeLock.request) {
            // A promessa rejeita de forma assincrona (aba em segundo plano,
            // permissao negada). Sem .catch ela vira excecao solta.
            var p = navigator.wakeLock.request('screen');
            if (p && p.catch) p.catch(function () { });
          }
        } catch (e) { /* sem suporte: ignora */ }
        return Promise.resolve();
      },
      desligarTelaSempre: function () { return Promise.resolve(); },
      // O navegador nao tem como avisar essas coisas: quem decide e o
      // aparelho. Deixa quieto.
      aoAvisar: function () { }
    };
  }

  /**
   * Entrega o destino ao GPS padrao do aparelho.
   *
   * No Android, geo: e o protocolo que faz o sistema abrir o app de mapas
   * que o usuario configurou. Dentro do WebView do app isso nao dispara
   * nada, entao la quem resolve e o plugin, via Intent.
   *
   * No navegador o geo: tambem funciona, mas em desktop nao ha app nenhum:
   * por isso o fallback web, aberto so se a aba continuar visivel depois
   * do geo: (ou seja, ninguem assumiu).
   */
  /**
   * Rumo (bearing) entre dois pontos, em graus, 0 = norte, sentido horario.
   * E a conta "da bussola", a mesma usada para girar a seta do carro.
   */
  function bearingAB(a, b) {
    var fi1 = a[0] * Math.PI / 180;
    var fi2 = b[0] * Math.PI / 180;
    var dl = (b[1] - a[1]) * Math.PI / 180;
    var y = Math.sin(dl) * Math.cos(fi2);
    var x = Math.cos(fi1) * Math.sin(fi2) - Math.sin(fi1) * Math.cos(fi2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /**
   * Direcao da rota no ponto em que o usuario esta, com base na geometria.
   *
   * Usado pela seta do carro quando o GPS nao da rumo confiavel (parado,
   * dentro de tunel, entre predios): em vez de apontar para um lado qualquer
   * ou sumir, a seta acompanha a estrada — como Maps e Waze fazem.
   */
  function direcaoGeometria(prep, alongM) {
    var c = prep.cums;
    var g = prep.geometry;
    if (!c || !g || g.length < 2) return null;

    var total = c[c.length - 1];
    var along = Math.max(0, Math.min(alongM, total));

    // Segmento que contem "along". Andar ate o penultimo ponto evita
    // buscar bearing num intervalo que nao existe.
    var i = 0;
    while (i < c.length - 2 && c[i + 1] < along) i++;
    return bearingAB(g[i], g[i + 1]);
  }

  /**
   * Ponto [lat, lon] na geometria da rota a uma distancia percorrida "dist".
   * O ponto e interpolado entre os dois vertices do segmento, entao cai em
   * cima da linha (e nao num vertice que pode estar longe). Quem chama:
   * joga a seta do carro no lugar exato, e marca onde a proxima curva sera.
   */
  function pontoNaGeometria(prep, distM) {
    var c = prep.cums;
    var g = prep.geometry;
    if (!c || !g || g.length < 2) return null;

    var total = c[c.length - 1];
    var dist = Math.max(0, Math.min(distM, total));

    var i = 0;
    while (i < c.length - 2 && c[i + 1] < dist) i++;

    var a = g[i], b = g[i + 1];
    var trecho = c[i + 1] - c[i];
    var t = trecho > 0 ? (dist - c[i]) / trecho : 0;
    t = Math.max(0, Math.min(1, t));

    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  /**
   * Geometria da rota DO ponto atual ate o fim, para destacar o percurso
   * que ainda falta. O primeiro ponto e o usuario projetado na polyline
   * (nao um vertice real), entao a linha azul comeca exatamente onde o
   * carro esta — o efeito "percurso" do Waze.
   */
  function geometriaRestante(prep, alongM) {
    var c = prep.cums;
    var g = prep.geometry;
    if (!c || !g || g.length < 2) return [];

    var total = c[c.length - 1];
    var along = Math.max(0, Math.min(alongM, total));

    var i = 0;
    while (i < c.length - 2 && c[i + 1] < along) i++;
    var a = g[i], b = g[i + 1];
    var trecho = c[i + 1] - c[i];
    var t = trecho > 0 ? (along - c[i]) / trecho : 0;
    t = Math.max(0, Math.min(1, t));

    var restante = [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]];
    for (var j = i + 1; j < g.length; j++) restante.push(g[j]);
    return restante;
  }

  function abrirExterno(dest) {
    var ll = dest.lat + ',' + dest.lon;
    var rotulo = dest.label || 'Destino';

    var g = pluginNativo();
    if (ehNativo() && g.abrirMapa) {
      return g.abrirMapa({
        lat: String(dest.lat),
        lon: String(dest.lon),
        label: rotulo
      });
    }

    var iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    var nativoUrl = 'geo:' + ll + '?q=' + ll + '(' + encodeURIComponent(rotulo) + ')';
    var webUrl = iOS
      ? 'https://maps.apple.com/?daddr=' + ll + '&dirflg=d'
      : 'https://www.google.com/maps/dir/?api=1&destination=' + ll;

    try {
      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = nativoUrl;
      document.body.appendChild(iframe);
      setTimeout(function () {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1200);
    } catch (e) {
      // navegador bloqueou o iframe: cai direto na versao web
      window.open(webUrl, '_blank', 'noopener');
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      setTimeout(function () {
        // Se um app abriu de verdade, esta aba foi para segundo plano e o
        // document.hidden virou true. Se segue visivel, o geo: nao pegou.
        if (!document.hidden && document.visibilityState === 'visible') {
          window.open(webUrl, '_blank', 'noopener');
        }
        resolve();
      }, 1300);
    });
  }

  var api = {
    // pura, testavel
    haversine: haversine,
    cumulativos: cumulativos,
    maisPerto: maisPerto,
    prepararRota: prepararRota,
    proximoPasso: proximoPasso,
    restante: restante,
    bearingAB: bearingAB,
    direcaoGeometria: direcaoGeometria,
    geometriaRestante: geometriaRestante,
    pontoNaGeometria: pontoNaGeometria,
    // ponte
    ehNativo: ehNativo,
    ponte: ponte,
    abrirExterno: abrirExterno
  };

  // No navegador vira global, como NAV_CONFIG e NAV_SERVICES. No Node, usado
  // pelos testes, sai por module.exports: la nao existe window.
  if (typeof window !== 'undefined') window.NAV_NAV = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();