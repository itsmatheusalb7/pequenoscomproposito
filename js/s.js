/**
 * TrackFlow — tracker.js para Infoproduto (landing pages estáticas)
 *
 * Não depende de window.Shopify. Configurado via data attributes no <script>.
 *
 *   <script src="https://dashboard.trackflowvtx.org/tracker-infoproduto.js"
 *           data-store-id="abc123-uuid"
 *           data-checkout-domains="pay.hotmart.com,checkout.hotmart.com"
 *           data-tracking-param="sck"
 *           data-cross-domain-domains="advertorial.exemplo.com,oferta.exemplo.com"
 *           async></script>
 *
 * Features adicionais ao tracker Shopify:
 *  1. Link rewriter: injeta sck (=visitor_id) em links de checkout
 *  2. Cross-domain propagation: visitor_id via _vid param entre landings
 *  3. Event detection via meta tags: <meta name="dash:event">
 *  4. InitiateCheckout: click em links para checkout domains
 *
 * Entrega first-party (recomendado): servir o script e a API através de um
 * proxy same-origin da própria landing (rewrite Vercel) e declarar a base:
 *
 *   <script src="/s.js" data-api-base="/api/s" data-store-id="…" async></script>
 *
 * Versão: 1.1
 *
 * ⚠️ Este ficheiro e o public/tracker.js partilham quase toda a infraestrutura
 * (resolução de endpoints, fallback, API pública). Não há build step que os
 * junte — alterações a essas partes têm de ser espelhadas nos dois.
 */
(function () {
  'use strict';

  var _qs = new URLSearchParams(window.location.search);
  var DEBUG = _qs.get('tfdebug') === '1';

  function debug() {
    if (!DEBUG) return;
    try {
      console.log.apply(
        console,
        ['[trackflow]'].concat(Array.prototype.slice.call(arguments)),
      );
    } catch (e) {}
  }

  // ─────────── Script tag attrs ───────────
  function findOwnScriptTag() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].getAttribute('src') || '';
      // '/s.js' é o path servido pelo proxy first-party da landing.
      if (
        src.indexOf('tracker-infoproduto.js') !== -1 ||
        /(^|\/)s\.js(\?|$)/.test(src)
      ) {
        return scripts[i];
      }
    }
    return null;
  }
  var ownScript = findOwnScriptTag();
  if (!ownScript) {
    console.warn('[trackflow-infoproduto] script tag não encontrado');
    return;
  }

  // ?tfstore= permite testar outra loja sem mexer no snippet (debug).
  var STORE_ID = _qs.get('tfstore') || ownScript.getAttribute('data-store-id');
  if (!STORE_ID) {
    console.warn('[trackflow-infoproduto] data-store-id ausente');
    return;
  }

  // ─────────── Entrega: first-party vs third-party ───────────
  // Ver o bloco equivalente (comentado em detalhe) em public/tracker.js.
  var FALLBACK_BASE = 'https://dashboard.trackflowvtx.org/api/tf';
  var DEFAULT_FP_BASE = '/api/s';

  function stripTrailingSlash(s) {
    return s.charAt(s.length - 1) === '/' ? s.slice(0, -1) : s;
  }

  function isSameOriginSrc(src) {
    if (!src) return false;
    if (src.indexOf('//') === 0) {
      return src.indexOf('//' + window.location.host + '/') === 0;
    }
    if (/^https?:\/\//i.test(src)) {
      return src.indexOf(window.location.origin + '/') === 0;
    }
    return true; // path relativo ou absoluto no próprio host
  }

  function resolveApiBase() {
    var override = _qs.get('tfbase');
    if (override) return stripTrailingSlash(override);
    var attr = ownScript.getAttribute('data-api-base');
    if (attr) return stripTrailingSlash(attr);
    if (isSameOriginSrc(ownScript.getAttribute('src'))) return DEFAULT_FP_BASE;
    return FALLBACK_BASE;
  }

  var activeBase = resolveApiBase();
  var isFirstParty = activeBase !== FALLBACK_BASE;
  debug('base', activeBase, isFirstParty ? '(first-party)' : '(third-party)');

  var fallbackUsed = !isFirstParty;

  function requestOpts(base, body) {
    var firstParty = base !== FALLBACK_BASE;
    var opts = {
      method: body === undefined ? 'GET' : 'POST',
      keepalive: true,
      credentials: firstParty ? 'same-origin' : 'omit',
    };
    if (!firstParty) opts.mode = 'cors';
    if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = body;
    }
    return opts;
  }

  // Fixa a base de fallback para as chamadas seguintes. Cada chamada decide o
  // seu próprio retry pelo `base` que usou — não por esta flag — senão dois
  // eventos a falhar em paralelo só teriam um deles retentado.
  function switchToFallback() {
    if (fallbackUsed) return;
    fallbackUsed = true;
    activeBase = FALLBACK_BASE;
    debug('base first-party falhou; fallback →', FALLBACK_BASE);
  }

  function postEvent(body) {
    if (typeof fetch === 'undefined') {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          activeBase + '/e',
          new Blob([body], { type: 'application/json' }),
        );
      }
      return;
    }
    var base = activeBase;
    fetch(base + '/e', requestOpts(base, body)).catch(function () {
      // Só rejeições de rede chegam aqui — uma resposta HTTP (mesmo 4xx/5xx)
      // resolve, e repeti-la duplicaria o evento. O retry corre uma única vez
      // porque a segunda tentativa já usa FALLBACK_BASE.
      if (base === FALLBACK_BASE) return;
      switchToFallback();
      fetch(
        FALLBACK_BASE + '/e',
        requestOpts(FALLBACK_BASE, body),
      ).catch(function () {});
    });
  }

  function fetchConfig(query, onConfig) {
    if (typeof fetch === 'undefined') return;
    var attempt = function (base) {
      fetch(base + '/c' + query, requestOpts(base))
        .then(
          function (r) {
            return r.ok ? r.json() : {};
          },
          function () {
            if (base === FALLBACK_BASE) return null;
            switchToFallback();
            attempt(FALLBACK_BASE);
            return null;
          },
        )
        .then(function (cfg) {
          if (cfg) onConfig(cfg);
        })
        .catch(function () {});
    };
    attempt(activeBase);
  }

  var checkoutAttr = ownScript.getAttribute('data-checkout-domains') || '';
  var CHECKOUT_DOMAINS = checkoutAttr
    .split(',')
    .map(function (d) {
      return d.trim().toLowerCase();
    })
    .filter(Boolean);

  var crossAttr = ownScript.getAttribute('data-cross-domain-domains') || '';
  var CROSS_DOMAIN_DOMAINS = crossAttr
    .split(',')
    .map(function (d) {
      return d.trim().toLowerCase();
    })
    .filter(Boolean);

  var TRACKING_PARAM_NAME =
    ownScript.getAttribute('data-tracking-param') || 'sck';

  // ─────────── Meta Pixel base ───────────
  (function (f, b, e, v) {
    if (f.fbq) return;
    var n = (f.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments)
        : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    var t = b.createElement(e);
    t.async = true;
    t.src = v;
    var s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(
    window,
    document,
    'script',
    'https://connect.facebook.net/en_US/fbevents.js',
  );

  // ─────────── TikTok Pixel base (carrega events.js) ───────────
  // Mesmo padrão do Meta: evento em paralelo client-side (ttq) e server-side
  // (Events API) com o MESMO event_id → TikTok desduplica. Pixel code chega
  // async do fetchConfig; o stub oficial enfileira chamadas pré-load.
  !(function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = (w[t] = w[t] || []);
    ttq.methods = [
      'page',
      'track',
      'identify',
      'instances',
      'load',
      'debug',
      'on',
      'off',
      'once',
      'ready',
      'alias',
      'group',
      'enableCookie',
      'disableCookie',
    ];
    ttq.setAndDefer = function (obj, method) {
      obj[method] = function () {
        obj.push([method].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.load = function (pixelId) {
      var url =
        'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + pixelId;
      ttq._i = ttq._i || {};
      ttq._i[pixelId] = {};
      ttq._i[pixelId]._u = url;
      ttq._t = ttq._t || {};
      ttq._t[pixelId] = +new Date();
      var s = d.getElementsByTagName('script')[0];
      var a = d.createElement('script');
      a.type = 'text/javascript';
      a.async = true;
      a.src = url;
      s.parentNode.insertBefore(a, s);
    };
  })(window, document, 'ttq');

  // ─────────── Snapchat Pixel base (carrega scevent.min.js) ───────────
  // Mesmo padrão de Meta/TikTok: evento client-side (snaptr) e server-side
  // (Snap CAPI) com o MESMO id → Snapchat desduplica numa janela de 48h.
  (function (e, t, n) {
    if (e.snaptr) return;
    var a = (e.snaptr = function () {
      a.handleRequest ? a.handleRequest.apply(a, arguments) : a.queue.push(arguments);
    });
    a.queue = [];
    var s = 'script';
    var r = t.createElement(s);
    r.async = !0;
    r.src = n;
    var u = t.getElementsByTagName(s)[0];
    u.parentNode.insertBefore(r, u);
  })(window, document, 'https://sc-static.net/scevent.min.js');

  // ─────────── TikTok Pixel buffer (race: track antes de load) ───────────
  var ttqReady = false;
  var ttqQueue = [];
  function ttqSafe() {
    var args = Array.prototype.slice.call(arguments);
    if (ttqReady && typeof window.ttq === 'object' && window.ttq) {
      try {
        var method = args[0];
        if (typeof window.ttq[method] === 'function') {
          window.ttq[method].apply(window.ttq, args.slice(1));
        }
      } catch (e) {}
    } else {
      ttqQueue.push(args);
    }
  }

  // ─────────── Snapchat Pixel buffer (race: track antes de init) ───────────
  var snaptrReady = false;
  var snaptrQueue = [];
  function snaptrSafe() {
    var args = Array.prototype.slice.call(arguments);
    if (snaptrReady && typeof window.snaptr === 'function') {
      try {
        window.snaptr.apply(window, args);
      } catch (e) {}
    } else {
      snaptrQueue.push(args);
    }
  }

  // ─────────── Pixel buffer (race condition: init vs primeiro track) ───────────
  // O init chega async (depois do fetch). Se o primeiro track for chamado
  // antes do init, o fbq('track') é processado SEM pixel associado → Meta
  // recebe o evento via CAPI mas não consegue deduplicar com o Pixel.
  // Solução: buffer os fbq calls até init estar confirmado.
  var pixelReady = false;
  var pixelQueue = [];
  function fbqSafe() {
    var args = Array.prototype.slice.call(arguments);
    if (pixelReady && typeof window.fbq === 'function') {
      try {
        window.fbq.apply(window, args);
      } catch (e) {}
    } else {
      pixelQueue.push(args);
    }
  }

  // ─────────── Cookie helpers ───────────
  function getCookie(name) {
    var match = document.cookie.match(
      new RegExp('(^| )' + name + '=([^;]+)'),
    );
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, value, days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    document.cookie =
      name +
      '=' +
      encodeURIComponent(value) +
      '; expires=' +
      d.toUTCString() +
      '; path=/; SameSite=Lax; Secure';
  }

  function isValidUuid(s) {
    return (
      typeof s === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        s,
      )
    );
  }

  function uuidv4() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (
      c,
    ) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ─────────── Cross-domain propagation ───────────
  var urlParams = new URLSearchParams(window.location.search);
  var incomingVid = urlParams.get('_vid');
  // Origem do visitor_id: 'url' faz o servidor dar-lhe precedência sobre o
  // cookie durável dele (senão o cookie deste domínio partia a continuidade
  // da sessão vinda do advertorial).
  var vidSource = 'cookie';
  if (incomingVid && isValidUuid(incomingVid)) {
    vidSource = 'url';
    setCookie('_dash_vid', incomingVid, 365);
    // Mantém a query original na URL para os próximos redirecionamentos.
  }

  // ─────────── visitor_id ───────────
  var visitorId = getCookie('_dash_vid');
  if (!visitorId) {
    if (vidSource !== 'url') vidSource = 'new';
    visitorId = uuidv4();
    setCookie('_dash_vid', visitorId, 365);
  }

  // ─────────── Config: pixel_id + identidade autoritativa ───────────
  // Mandamos o visitor_id local e recebemos de volta o autoritativo: em modo
  // first-party o servidor tem um cookie HttpOnly (_dash_sid) que o Safari ITP
  // não capa a 7 dias. Se divergir, adoptamo-lo E reescrevemos os links de
  // checkout — o `sck` que segue para a Hotmart TEM de ser igual ao
  // sessions.visitor_id, senão a order não é atribuída.
  fetchConfig(
    '?store_id=' +
      encodeURIComponent(STORE_ID) +
      '&vid=' +
      encodeURIComponent(visitorId) +
      '&vid_source=' +
      vidSource,
    function (cfg) {
      if (!cfg) return;
      if (cfg.vid && cfg.vid !== visitorId) {
        debug('vid do servidor adoptado', visitorId, '→', cfg.vid);
        visitorId = cfg.vid;
        vidSource = 'cookie';
        setCookie('_dash_vid', visitorId, 365);
        var stale = document.querySelectorAll('a[data-dash-rewritten]');
        for (var i = 0; i < stale.length; i++) {
          stale[i].removeAttribute('data-dash-rewritten');
          // O sck/_vid antigos já estão no href; repô-los com o novo valor.
          try {
            var u = new URL(stale[i].href);
            u.searchParams.delete(TRACKING_PARAM_NAME);
            u.searchParams.delete('_vid');
            stale[i].href = u.toString();
          } catch (e) {}
        }
        rewriteAllLinks();
      }
      if (cfg.pixel_id && typeof window.fbq === 'function') {
        window.fbq('init', String(cfg.pixel_id));
        pixelReady = true;
        // Flush events queueados antes do init
        while (pixelQueue.length) {
          try {
            window.fbq.apply(window, pixelQueue.shift());
          } catch (e) {}
        }
      }
      if (cfg.tiktok_pixel_id && typeof window.ttq === 'object') {
        window.ttq.load(String(cfg.tiktok_pixel_id));
        window.ttq.page();
        ttqReady = true;
        while (ttqQueue.length) {
          try {
            var q = ttqQueue.shift();
            var m = q[0];
            if (typeof window.ttq[m] === 'function') {
              window.ttq[m].apply(window.ttq, q.slice(1));
            }
          } catch (e) {}
        }
      }
      if (cfg.snapchat_pixel_id && typeof window.snaptr === 'function') {
        window.snaptr('init', String(cfg.snapchat_pixel_id));
        snaptrReady = true;
        while (snaptrQueue.length) {
          try {
            window.snaptr.apply(window, snaptrQueue.shift());
          } catch (e) {}
        }
      }
    },
  );

  // ─────────── attribution capture ───────────
  var newAttribution = {
    fbclid: urlParams.get('fbclid'),
    gclid: urlParams.get('gclid'),
    ttclid: urlParams.get('ttclid'),
    // Snapchat anexa `ScCid` ao URL de destino do ad (case-sensitive).
    sc_click_id: urlParams.get('ScCid'),
    utm_source: urlParams.get('utm_source'),
    utm_medium: urlParams.get('utm_medium'),
    utm_campaign: urlParams.get('utm_campaign'),
    utm_content: urlParams.get('utm_content'),
    utm_term: urlParams.get('utm_term'),
  };
  var hasAttribution = false;
  for (var k in newAttribution) {
    if (newAttribution[k]) {
      hasAttribution = true;
      break;
    }
  }
  if (hasAttribution) {
    setCookie('_dash_attr', JSON.stringify(newAttribution), 90);
  }

  // _fbc cookie. Formato Meta: fb.<subdomain_idx>.<creation_ms>.<fbclid>
  // Lemos o fbclid RAW (sem o decode automático do URLSearchParams) e só
  // reescrevemos se o fbclid mudou face ao já guardado — assim novo ad
  // refresca o cookie (memo: fbclids antigos não persistem 90d) sem
  // reescrever o timestamp em cada page-load, o que a Meta marca como
  // "fbc modificado" (diverge do Pixel browser-side e entre eventos).
  function getRawQueryParam(name) {
    var s = window.location.search;
    if (!s || s.charAt(0) !== '?') return null;
    var pairs = s.substring(1).split('&');
    for (var i = 0; i < pairs.length; i++) {
      var eq = pairs[i].indexOf('=');
      var key = eq < 0 ? pairs[i] : pairs[i].substring(0, eq);
      if (key === name) return eq < 0 ? '' : pairs[i].substring(eq + 1);
    }
    return null;
  }
  var rawFbclid = getRawQueryParam('fbclid');
  if (rawFbclid) {
    var existingFbc = getCookie('_fbc');
    var existingFbclid =
      existingFbc && existingFbc.indexOf('fb.') === 0
        ? existingFbc.split('.').slice(3).join('.')
        : null;
    if (rawFbclid !== existingFbclid) {
      setCookie('_fbc', 'fb.1.' + Date.now() + '.' + rawFbclid, 90);
    }
  }

  // Gera/lê `_fbp` proativamente — fbevents.js seta este cookie tarde (após
  // carregar) e o primeiro track() iria com fbp=null em visitantes que
  // bouncam na 1ª página. Formato oficial Meta: fb.1.{epoch_ms}.{rand_10d}.
  function getOrCreateFbp() {
    var existing = getCookie('_fbp');
    if (existing) return existing;
    var rand = Math.floor(Math.random() * 9000000000) + 1000000000;
    var fbp = 'fb.1.' + Date.now() + '.' + rand;
    setCookie('_fbp', fbp, 90);
    return fbp;
  }
  function getFbc() {
    return getCookie('_fbc');
  }
  function getAttribution() {
    try {
      return JSON.parse(getCookie('_dash_attr') || '{}');
    } catch (e) {
      return {};
    }
  }

  // ─────────── Event ID determinístico ───────────
  function generateEventId(eventName) {
    return eventName + '-' + visitorId + '-' + Date.now();
  }

  // ─────────── Track ───────────
  function track(eventName, eventData) {
    var eventId =
      eventData && eventData.event_id
        ? eventData.event_id
        : generateEventId(eventName);
    var payload = {
      store_id: STORE_ID,
      visitor_id: visitorId,
      vid_source: vidSource,
      fp: isFirstParty,
      event_id: eventId,
      event_name: eventName,
      event_time: new Date().toISOString(),
      event_source_url: window.location.href,
      attribution: getAttribution(),
      fbp: getOrCreateFbp(),
      fbc: getFbc(),
      ttp: getCookie('_ttp'),
      scid: getCookie('_scid'),
    };
    if (eventData) {
      for (var key in eventData) {
        if (key === 'event_id') continue;
        if (eventData[key] !== undefined && eventData[key] !== null) {
          payload[key] = eventData[key];
        }
      }
    }

    debug('track', eventName, payload);
    postEvent(JSON.stringify(payload));

    var fbqParams = {};
    if (eventData) {
      if (typeof eventData.value === 'number') {
        fbqParams.value = eventData.value;
      }
      if (eventData.currency) fbqParams.currency = eventData.currency;
      if (eventData.content_ids) {
        fbqParams.content_ids = eventData.content_ids;
        fbqParams.content_type = 'product';
      }
      if (typeof eventData.num_items === 'number') {
        fbqParams.num_items = eventData.num_items;
      }
    }
    fbqSafe('track', eventName, fbqParams, { eventID: eventId });

    // TikTok Pixel client-side com o MESMO event_id → dedup vs Events API.
    var tiktokEvent = mapToTiktokEvent(eventName);
    if (tiktokEvent) {
      ttqSafe('track', tiktokEvent, fbqParams, { event_id: eventId });
    }

    // Snapchat Pixel client-side com o MESMO id → dedup vs Snap CAPI (48h).
    // O Snapchat usa nomes de parâmetro próprios (price/transaction_id/…), não
    // os do Meta. Mandamos `client_dedup_id` e `event_id`: a documentação do
    // pixel refere o primeiro e a da CAPI v3 o segundo — enviar ambos evita
    // depender de qual deles é o que casa.
    var snapEvent = mapToSnapchatEvent(eventName);
    if (snapEvent) {
      var snapParams = { client_dedup_id: eventId, event_id: eventId };
      if (eventData) {
        if (typeof eventData.value === 'number') snapParams.price = eventData.value;
        if (eventData.currency) snapParams.currency = eventData.currency;
        if (eventData.content_ids) snapParams.item_ids = eventData.content_ids;
        if (typeof eventData.num_items === 'number') {
          snapParams.number_items = eventData.num_items;
        }
        if (eventData.order_id) snapParams.transaction_id = eventData.order_id;
      }
      snaptrSafe('track', snapEvent, snapParams);
    }
  }

  // Mapeia nomes de evento internos → standard events TikTok (case-sensitive).
  // null = sem equivalente TikTok (PageView → ttq.page() automático).
  function mapToTiktokEvent(eventName) {
    switch (eventName) {
      case 'ViewContent':
        return 'ViewContent';
      case 'AddToCart':
        return 'AddToCart';
      case 'InitiateCheckout':
        return 'InitiateCheckout';
      case 'Purchase':
        return 'CompletePayment';
      case 'Lead':
        return 'SubmitForm';
      case 'PageView':
      case 'ScrollDepth':
        return null;
      default:
        return eventName;
    }
  }

  // Mapeia nomes de evento internos → enum Snapchat (UPPER_SNAKE_CASE).
  // Tem de ficar em sync com mapTrackerEventToSnapchat() no servidor, senão o
  // pixel e a CAPI mandam nomes diferentes e a dedup não acontece.
  // Snapchat só aceita o enum documentado — nomes fora dele são rejeitados,
  // por isso o default é null (skip) e não o nome do tracker.
  function mapToSnapchatEvent(eventName) {
    switch (eventName) {
      case 'PageView':
        return 'PAGE_VIEW';
      case 'ViewContent':
        return 'VIEW_CONTENT';
      case 'AddToCart':
        return 'ADD_CART';
      case 'InitiateCheckout':
        return 'START_CHECKOUT';
      case 'Purchase':
        return 'PURCHASE';
      case 'Lead':
        return 'SIGN_UP';
      case 'Search':
        return 'SEARCH';
      default:
        return null;
    }
  }

  // ─────────── API pública + drenagem das filas do loader ───────────
  // O loader inline colado no <head> enfileira eventos disparados antes deste
  // script carregar (padrão fbq/gtag). Duas filas: `window.dashTrack.q` e
  // `window.trackflow._q` (contrato já em produção no app embed Shopify).
  // Instalado ANTES do PageView: o enfileirado aconteceu primeiro.
  function installPublicApi() {
    var queued = [];
    if (typeof window.dashTrack === 'function' && window.dashTrack.q) {
      queued = queued.concat(Array.prototype.slice.call(window.dashTrack.q));
    }
    if (window.trackflow && window.trackflow._q) {
      queued = queued.concat(Array.prototype.slice.call(window.trackflow._q));
    }

    window.dashTrack = track;
    window.trackflow = window.trackflow || {};
    window.trackflow.track = function (eventName, data) {
      if (!eventName) return;
      track(eventName, data);
    };
    window.trackflow._q = [];

    for (var i = 0; i < queued.length; i++) {
      try {
        track.apply(null, queued[i]);
      } catch (e) {}
    }
  }
  installPublicApi();

  // ─────────── Auto-event PageView ───────────
  track('PageView');

  // ─────────── Link rewriter (checkout + cross-domain) ───────────
  function isCheckoutHost(hostname) {
    hostname = (hostname || '').toLowerCase();
    for (var i = 0; i < CHECKOUT_DOMAINS.length; i++) {
      var d = CHECKOUT_DOMAINS[i];
      if (hostname === d || hostname.endsWith('.' + d)) return true;
    }
    return false;
  }

  function isCrossDomainHost(hostname) {
    hostname = (hostname || '').toLowerCase();
    for (var i = 0; i < CROSS_DOMAIN_DOMAINS.length; i++) {
      var d = CROSS_DOMAIN_DOMAINS[i];
      if (hostname === d || hostname.endsWith('.' + d)) return true;
    }
    return false;
  }

  function rewriteLink(link) {
    if (!link || !link.href || link.dataset.dashRewritten) return;
    try {
      var u = new URL(link.href);
      if (isCheckoutHost(u.hostname)) {
        if (!u.searchParams.has(TRACKING_PARAM_NAME)) {
          u.searchParams.set(TRACKING_PARAM_NAME, visitorId);
        }
        var attr = getAttribution();
        if (attr.fbclid && !u.searchParams.has('fbclid')) {
          u.searchParams.set('fbclid', attr.fbclid);
        }
        // Hotmart aceita xcod (utm_campaign equivalente) e src (utm_source)
        if (attr.utm_campaign && !u.searchParams.has('xcod')) {
          u.searchParams.set('xcod', attr.utm_campaign);
        }
        if (attr.utm_source && !u.searchParams.has('src')) {
          u.searchParams.set('src', attr.utm_source);
        }
        link.href = u.toString();
        link.dataset.dashRewritten = 'true';
      } else if (isCrossDomainHost(u.hostname)) {
        if (!u.searchParams.has('_vid')) {
          u.searchParams.set('_vid', visitorId);
          link.href = u.toString();
        }
      }
    } catch (e) {}
  }

  function rewriteAllLinks() {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      rewriteLink(links[i]);
    }
  }

  rewriteAllLinks();

  // MutationObserver para SPAs e modais
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'A') {
            rewriteLink(node);
          } else if (node.querySelectorAll) {
            var inner = node.querySelectorAll('a[href]');
            for (var i = 0; i < inner.length; i++) rewriteLink(inner[i]);
          }
        });
      });
    });
    try {
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch (e) {}
  }

  // Dados de produto das meta tags dash:* — populado por readMetaEvent() e
  // reutilizado pelo InitiateCheckout automático (click no link de checkout).
  // value/currency só são anexados a InitiateCheckout e Purchase
  // (ver readMetaEvent); ViewContent e outros eventos de topo não levam value.
  var metaProductData = {};

  // Click delegation: garante rewrite even em links just-in-time + dispara IC
  document.addEventListener(
    'click',
    function (e) {
      var target = e.target;
      if (!target || typeof target.closest !== 'function') return;
      var link = target.closest('a[href]');
      if (!link) return;
      rewriteLink(link);

      try {
        var u = new URL(link.href);
        if (isCheckoutHost(u.hostname)) {
          // Se o user já tem onclick com dashTrack('InitiateCheckout',...), não
          // dispara o automático — senão chegam 2 eventos ao Meta e o
          // EventManager mostra duplicados.
          var oc = link.getAttribute('onclick') || '';
          if (/dashTrack\s*\(\s*['"]InitiateCheckout/i.test(oc)) {
            return;
          }
          track('InitiateCheckout', metaProductData);
        }
      } catch (err) {}
    },
    true,
  );

  // ─────────── Event detection via meta tags ───────────
  // <meta name="dash:event" content="ViewContent">
  // <meta name="dash:value" content="97.00">
  // <meta name="dash:currency" content="BRL">
  // <meta name="dash:content-ids" content="curso-x">
  // <meta name="dash:num-items" content="1">
  //
  // value/currency só são anexados a InitiateCheckout e Purchase. ViewContent
  // (e restantes eventos de topo de funil) recebem apenas content_ids/num_items
  // — enviar value em ViewContent infla o valor reportado e não é recomendado.
  function readMetaProductData() {
    var data = {};
    var valueMeta = document.querySelector('meta[name="dash:value"]');
    if (valueMeta) {
      var v = parseFloat(valueMeta.getAttribute('content') || '');
      if (!isNaN(v)) data.value = v;
    }
    var currencyMeta = document.querySelector('meta[name="dash:currency"]');
    if (currencyMeta) {
      var c = currencyMeta.getAttribute('content');
      if (c) data.currency = c;
    }
    var idsMeta = document.querySelector('meta[name="dash:content-ids"]');
    if (idsMeta) {
      var ids = (idsMeta.getAttribute('content') || '')
        .split(',')
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      if (ids.length) data.content_ids = ids;
    }
    var numMeta = document.querySelector('meta[name="dash:num-items"]');
    if (numMeta) {
      var n = parseInt(numMeta.getAttribute('content') || '', 10);
      if (!isNaN(n)) data.num_items = n;
    }
    return data;
  }

  (function readMetaEvent() {
    var eventMeta = document.querySelector('meta[name="dash:event"]');
    if (!eventMeta) return;
    var eventName = eventMeta.getAttribute('content');
    if (!eventName) return;
    metaProductData = readMetaProductData();
    // value/currency só em eventos de fundo de funil. Topo (ViewContent,
    // AddToCart, Lead, …) leva apenas content_ids/num_items.
    var includeValue =
      eventName === 'InitiateCheckout' || eventName === 'Purchase';
    var data;
    if (includeValue) {
      data = metaProductData;
    } else {
      data = {};
      if (metaProductData.content_ids)
        data.content_ids = metaProductData.content_ids;
      if (typeof metaProductData.num_items === 'number')
        data.num_items = metaProductData.num_items;
    }
    track(eventName, data);
  })();
})();
