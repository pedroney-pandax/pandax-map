/* ------------------------------------------------------------------ *
 * Base remota: atualizar o conteudo do app sem reinstalar o APK.
 * ------------------------------------------------------------------ *
 * O APK abre com o conteudo embutido (www). No boot, se ja existe uma
 * "base" configurada (o servidor onde roda o site), este modulo consulta
 * o version.json de la e compara com o embutido:
 *
 *   - base ainda nao configurada -> card pede o endereco uma vez
 *   - versao da base > local     -> card "Nova versao disponivel"
 *     [Atualizar agora] baixa o pacote zip, o nativo extrai nos arquivos
 *     internos e o app passa a ser servido de la; os plugins (GPS/TTS)
 *     continuam no ar porque a origem nao mudou.
 *   - versoes iguais             -> nada aparece
 *
 * No navegador (site web) este modulo nao roda: la o usuario ja esta na
 * propria base, atualizar nao faz sentido.
 *
 * A "base" fica no localStorage (pandax.base). endereco digitado por
 * extenso, sem barra final: http://192.168.0.10:8080
 * ------------------------------------------------------------------ */

(function () {
  'use strict';

  var NS_BASE = 'pandax.base';      // endereco da base (localStorage)
  var NS_IGNORADA = 'pandax.silente'; // versao que o usuario dispensou

  var estado = {
    base: '',
    remota: null,     // identidade da versao na base {versao, hash}
    desc: '',         // como exibir essa versao ("0.2.0", "hash a1b2c3d4")
    ocupado: false
  };

  var elCaixa, elMsg, elConfig, elBase, elSalvar, elAcoes, elFazer, elDepois;

  function ehNativo() {
    return !!(window.Capacitor &&
      window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform());
  }

  function normalizarBase(b) {
    if (!b) return '';
    b = String(b).trim().replace(/[\/\\]+$/, '');
    if (b && !/^https?:\/\//i.test(b)) b = 'http://' + b;
    return b;
  }

  /*** Versoes ------------------------------------------------------ */

  function buscarJSON(url) {
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* Versao do conteudo EMBUTIDO (a que o APK instalou). */
  function versaoLocal() {
    return buscarJSON('./version.json').then(function (c) {
      return c ? normalizarIdentidade(c) : null;
    });
  }

  /* Versao publicada na base: primeiro em /www (pasta que vai no APK),
   * depois na raiz — o site pode estar publicado em qualquer das duas. */
  function versaoDaBase(base) {
    return buscarJSON(base + '/www/version.json').then(function (c) {
      if (c && (c.version || c.hash)) return normalizarIdentidade(c);
      return buscarJSON(base + '/version.json').then(function (c2) {
        return c2 ? normalizarIdentidade(c2) : null;
      });
    });
  }

  /* vira {versao, hash}; o hash garante que mudanca de conteudo com numero
   * de versao esquecido ainda seja detectada como atualizacao. */
  function normalizarIdentidade(c) {
    return {
      versao: (typeof c.version === 'string' && c.version) ? c.version : '',
      hash: (typeof c.hash === 'string' && c.hash) ? c.hash : ''
    };
  }

  /* chave estavel para o "dispensar": versao, ou hash se nao houver numero */
  function chaveIdentidade(id) {
    return id.versao || ('hash:' + id.hash);
  }

  function descIdentidade(id) {
    return id.versao || ('hash ' + id.hash.slice(0, 8));
  }

  /* Ha o que oferecer? igual em numero e em conteudo significa que o app
   * ja esta como a base; sem versao local (instalacao antiga) deixa
   * atualizar para nao prender ninguem em conteudo velho. */
  function atualizacaoPendente(local, remota) {
    if (!remota) return false;
    if (!local) return true;
    return local.versao !== remota.versao || local.hash !== remota.hash;
  }

  /*** Telas --------------------------------------------------------- */

  function abrir() {
    elCaixa.classList.remove('hidden');
  }

  function fechar() {
    elCaixa.classList.add('hidden');
  }

  function msg(texto) {
    elMsg.textContent = texto || '';
  }

  function mostrarConfig() {
    elAcoes.classList.add('hidden');
    elConfig.classList.remove('hidden');
  }

  function mostrarAcoes() {
    elConfig.classList.add('hidden');
    elAcoes.classList.remove('hidden');
  }

  function desativarBotoes() {
    elFazer.disabled = true;
    elDepois.disabled = true;
  }

  function reativarBotoes() {
    elFazer.disabled = false;
    elDepois.disabled = false;
  }

  /* Consulta em andamento: nenhuma acao visivel. */
  function mostrarNada() {
    elConfig.classList.add('hidden');
    elAcoes.classList.add('hidden');
  }

  /* Fluxo sem base: pede o endereco uma vez. */
  function pedirBase() {
    elBase.value = estado.base || '';
    msg('Qual o endereco da base onde roda o site?' +
      ' Ex.: http://192.168.0.10:8080 (celular na mesma rede Wi-Fi).');
    mostrarConfig();
    abrir();
  }

  function checar(base) {
    estado.base = base;
    mostrarNada();
    abrir();
    msg('Verificando atualizacoes...');

    versaoLocal().then(function (local) {
      versaoDaBase(base).then(function (remota) {
        if (!remota) {
          msg('Nao encontrei o version.json na base "' + base + '".' +
            ' Confira o endereco e se o server.js esta rodando.');
          mostrarConfig();
          return;
        }
        if (chaveIdentidade(remota) === localStorage.getItem(NS_IGNORADA)) {
          fechar();
          return;
        }
        if (!atualizacaoPendente(local, remota)) {
          fechar(); // ja esta atualizado (inclusive depois do update)
          return;
        }
        estado.remota = remota;
        estado.desc = descIdentidade(remota);
        if (local && local.versao) {
          msg('Nova versao ' + estado.desc + ' disponivel.' +
            ' Voce esta na ' + local.versao + '.');
        } else {
          msg('Atualizacao disponivel: ' + estado.desc + '.');
        }
        mostrarAcoes();
      });
    });
  }

  /*** Acoes --------------------------------------------------------- */

  function salvarBase() {
    var b = normalizarBase(elBase.value);
    if (!b) {
      msg('Digite o endereco da base. Ex.: http://192.168.0.10:8080');
      return;
    }
    try {
      localStorage.setItem(NS_BASE, b);
    } catch (e) {
      // sem armazenamento o check roda so nesta sessao
    }
    checar(b);
  }

  function dispensar() {
    try {
      localStorage.setItem(NS_IGNORADA,
        estado.remota ? chaveIdentidade(estado.remota) : '');
    } catch (e) { /* silencioso */ }
    fechar();
  }

  function atualizar() {
    if (estado.ocupado) return;
    if (!estado.base || !estado.remota) return;

    estado.ocupado = true;
    desativarBotoes();
    msg('Baixando e instalando a versao ' + estado.desc + '...');

    var url = estado.base + '/dist/pandax-map-www.zip';
    var plugin = window.Capacitor &&
      window.Capacitor.Plugins && window.Capacitor.Plugins.NavGuide;

    if (!plugin || !plugin.atualizarBase) {
      msg('Este aparelho nao suporta a atualizacao automatica.');
      reativarBotoes();
      estado.ocupado = false;
      return;
    }

    plugin.atualizarBase({ url: url, versao: estado.desc })
      .then(function () {
        // O nativo ja trocou a base e recarregou a pagina; na proxima
        // abertura local = remota e nada aparece.
        try {
          localStorage.removeItem(NS_IGNORADA);
        } catch (e) { /* silencioso */ }
        msg('Atualizado para a versao ' + estado.desc + '.');
      })
      .catch(function (err) {
        msg('Falha ao atualizar: ' +
          ((err && err.message) || 'verifique se o server.js esta rodando.'));
        reativarBotoes();
        estado.ocupado = false;
        mostrarAcoes();
      });
  }

  /*** Boot ----------------------------------------------------------- */

  function iniciar() {
    if (!ehNativo()) return;
 
    elCaixa = document.getElementById('update-box');
    if (!elCaixa) return;
    elMsg = document.getElementById('update-msg');
    elConfig = document.getElementById('update-config');
    elBase = document.getElementById('update-base');
    elSalvar = document.getElementById('update-salvar');
    elAcoes = document.getElementById('update-acoes');
    elFazer = document.getElementById('update-fazer');
    elDepois = document.getElementById('update-depois');
 
    elSalvar.addEventListener('click', salvarBase);
    elFazer.addEventListener('click', atualizar);
    elDepois.addEventListener('click', dispensar);
    elBase.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { salvarBase(); ev.preventDefault(); }
    });
 
    function acionarBase() {
      var base = '';
      try { base = normalizarBase(localStorage.getItem(NS_BASE)); } catch (e) { base = ''; }
      if (!base) {
        pedirBase();
        return;
      }
      checar(base);
    }
 
    window.pandaxAtualizarBase = acionarBase;
    var base = '';
    try { base = normalizarBase(localStorage.getItem(NS_BASE)); } catch (e) { /* vazio */ }
 
    if (!base) {
      pedirBase();
      return;
    }
    checar(base);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();