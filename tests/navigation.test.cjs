const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function browser(search) {
  const listeners = {};
  const window = {
    location: { search, href: 'https://example.com/up1/' + search },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  const context = vm.createContext({ window, URL, URLSearchParams, TextEncoder, TextDecoder, atob, btoa });
  vm.runInContext(read('js/navigation.js'), context);
  return { window, context, listeners };
}

const query = '?utm_source=meta&utm_campaign=a%20b&utm_content=x%2By&fbclid=FB%2F123&gclid=G123&custom=&repeat=1&repeat=2';
for (const [destination, search, expected] of [
  ['/obrigado/', '', '/obrigado/'],
  ['/obrigado/', query, '/obrigado/' + query],
  ['https://pay.cakto.com.br/359n2uw?offer=1', query, 'https://pay.cakto.com.br/359n2uw?offer=1&' + query.slice(1)],
  ['/obrigado/#material', query, '/obrigado/' + query + '#material'],
  ['/obrigado/?order=1#material', query, '/obrigado/?order=1&' + query.slice(1) + '#material'],
  ['/obrigado/?repeat=0', '?repeat=1&repeat=2', '/obrigado/?repeat=0&repeat=1&repeat=2'],
  ['/up1/', '?custom=' + 'x'.repeat(1000), '/up1/?custom=' + 'x'.repeat(1000)],
  [new URL('https://example.com/obrigado/'), query, 'https://example.com/obrigado/' + query]
]) {
  test('preserva a query sem filtrar: ' + String(destination), () => {
    const b = browser(search);
    b.context.redirectWithParams(destination);
    assert.equal(String(b.window.location.href), expected);
  });
}

test('lê os parâmetros atuais a cada redirecionamento', () => {
  const b = browser('?old=1');
  b.window.location.search = '?new=2';
  b.context.redirectWithParams('/next');
  assert.equal(b.window.location.href, '/next?new=2');
});

test('link dinâmico usa o destino final definido pelos trackers', () => {
  const b = browser(query);
  const link = { matches: () => true, hasAttribute: () => false,
    getAttribute: () => 'https://pay.cakto.com.br/359n2uw?sck=visitor',
    protocol: 'https:', href: 'https://pay.cakto.com.br/359n2uw?sck=visitor' };
  let prevented = false;
  b.listeners.click({ button: 0, defaultPrevented: false, composedPath: () => [{}, link],
    preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(b.window.location.href, link.href + '&' + query.slice(1));
});

test('respeita validação cancelada, âncoras, downloads e mailto', () => {
  for (const [cancelled, href, download, protocol] of [
    [true, '/next', false, 'https:'], [false, '#oferta-final', false, 'https:'],
    [false, '/material.pdf', true, 'https:'], [false, 'mailto:test@example.com', false, 'mailto:']
  ]) {
    const b = browser(query);
    const before = b.window.location.href;
    const link = { matches: () => true, hasAttribute: () => download, getAttribute: () => href, protocol };
    b.listeners.click({ button: 0, defaultPrevented: cancelled, composedPath: () => [link],
      preventDefault() { assert.fail('ação não deve ser interceptada'); } });
    assert.equal(b.window.location.href, before);
  }
});

test('Cakto: recusa mantém o token e os parâmetros até o obrigado', async () => {
  const b = browser(query + '&upsellToken=token-original');
  const registry = {};
  b.context.HTMLElement = class {
    attachShadow() { this.shadowRoot = { innerHTML: '', getElementById: () => ({ addEventListener() {}, disabled: false }) }; }
    getAttribute() { return 'https://example.com/obrigado/'; }
  };
  b.context.customElements = { define(name, component) { registry[name] = component; } };
  vm.runInContext(read('js/cakto-upsell.js'), b.context);
  const reject = new registry['cakto-upsell-reject']();
  reject.connectedCallback();
  await reject.loadUpsellReject();
  const url = new URL(b.window.location.href);
  assert.equal(url.pathname, '/obrigado/');
  assert.equal(url.searchParams.get('upsell_token_format'), 'b64url');
  assert.equal(atob(url.searchParams.get('upsellToken')), 'token-original');
  assert.ok(b.window.location.href.endsWith('&' + b.window.location.search.slice(1)));
  assert.equal(reject.button.disabled, false);
});

test('as duas variantes de preço mantêm checkout e parâmetros', () => {
  for (const variant of ['a', 'b']) {
    const b = browser(query);
    const link = {};
    b.window.__cjPriceVariant = variant;
    b.context.document = {
      querySelectorAll: selector => selector === '[data-checkout-ab]' ? [link] : [],
      documentElement: { classList: { remove() {} } }
    };
    vm.runInContext(read('js/script.js'), b.context);
    b.context.redirectWithParams(link.href);
    assert.equal(b.window.location.href, 'https://pagamentoverificadopt.lovable.app/' +
      (variant === 'b' ? '1700' : '1490') + query);
  }
});

test('auditoria de todos os scripts e páginas', () => {
  for (const file of fs.readdirSync(path.join(root, 'js'))) {
    if (!file.endsWith('.js')) continue;
    const code = read('js/' + file);
    new vm.Script(code, { filename: file });
    if (file !== 'navigation.js') {
      assert.doesNotMatch(code, /(?:window\.)?location(?:\.href)?\s*=(?!=)|location\.(?:assign|replace)\s*\(|window\.open\s*\(/);
    }
  }
  for (const file of ['index.html', 'up1/index.html', 'obrigado/index.html']) {
    const html = read(file);
    assert.match(html, /src="(?:\.\.\/)?js\/navigation\.js"/);
    assert.match(html, /cdn\.utmify\.com\.br\/scripts\/utms\/latest\.js/);
    assert.doesNotMatch(html, /http-equiv=["']refresh/i);
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      new vm.Script(match[1], { filename: file });
      assert.doesNotMatch(match[1], /location(?:\.href)?\s*=(?!=)|location\.(?:assign|replace)\s*\(|window\.open\s*\(/);
    }
  }
});
