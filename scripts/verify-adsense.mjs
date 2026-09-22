// Exercise the real modules with a controlled browser/Google boundary. No live
// ad requests or additional test dependencies are needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: file,
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), outputText)(
    id => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id),
    module, module.exports, ...Object.values(globals),
  );
  return module.exports;
}

const { getAdsenseConfig } = load('src/lib/adsense.ts');
const configured = {
  NODE_ENV: 'production', NEXT_PUBLIC_ADSENSE_ENABLED: 'true',
  NEXT_PUBLIC_ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
  NEXT_PUBLIC_ADSENSE_SLOT_HOME: '1234567890',
};

test('verification works before activation; missing/invalid configuration cannot serve ads', async () => {
  for (const env of [{}, { ...configured, NEXT_PUBLIC_ADSENSE_CLIENT_ID: 'ca-pub-XXXXXXXX' }]) {
    const adsense = getAdsenseConfig(env);
    assert.equal(adsense.enabled, false);
    const { GET } = load('src/app/ads.txt/route.ts', { '@/lib/adsense': { adsense } });
    assert.equal(GET().status, 404);
    assert.equal(GET().headers.get('Cache-Control'), 'no-store');
    assert.doesNotMatch(await GET().text(), /DIRECT/);
  }
  const adsense = getAdsenseConfig({ ...configured, NEXT_PUBLIC_ADSENSE_ENABLED: 'false' });
  assert.equal(adsense.enabled, false);
  const { GET } = load('src/app/ads.txt/route.ts', { '@/lib/adsense': { adsense } });
  assert.equal(GET().status, 200);
  assert.match(GET().headers.get('Content-Type'), /text\/plain/);
  assert.equal(await GET().text(), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
});

test('development is local-only; production ignores preview; bad slots remain hidden', () => {
  const local = getAdsenseConfig({ ...configured, NODE_ENV: 'development', NEXT_PUBLIC_ADSENSE_PREVIEW: 'true' });
  assert.equal(local.enabled, false);
  assert.equal(local.preview, true);
  const live = getAdsenseConfig({ ...configured, NEXT_PUBLIC_ADSENSE_PREVIEW: 'true', NEXT_PUBLIC_ADSENSE_SLOT_GENERATE: 'replace-me' });
  assert.equal(live.enabled, true);
  assert.equal(live.preview, false);
  assert.equal(live.slots.generate, '');
  assert.equal(getAdsenseConfig({ ...configured, NEXT_PUBLIC_ADSENSE_SLOT_HOME: '' }).enabled, false);
});

function adHarness({ config = getAdsenseConfig(configured), status = 'ready', width = 900, throws = false, filled = false } = {}) {
  const refs = [];
  let cursor = 0;
  let effect;
  let failed = false;
  let requests = 0;
  let resize;
  let disconnected = false;
  const element = {
    isConnected: true,
    getBoundingClientRect: () => ({ width }),
    hasAttribute: () => filled,
  };
  const window = { adsbygoogle: { push() { requests++; if (throws) throw new Error('blocked'); } } };
  const AdUnit = load('src/app/components/AdUnit.tsx', {
    react: {
      useRef(initial) { return refs[cursor++] ??= { current: initial }; },
      useEffect(callback) { effect = callback; },
      useState() { return [failed, value => { failed = value; }]; },
    },
    '@/lib/adsense': { adsense: config },
    './AdSenseProvider': { useAdSenseStatus: () => status },
  }, {
    window,
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  }).default;
  return {
    render(placement = 'home') { cursor = 0; return AdUnit({ placement }); },
    runEffect() { refs[0].current = element; return effect(); },
    get requests() { return requests; },
    get disconnected() { return disconnected; },
    setStatus(value) { status = value; },
    resize(value) { width = value; resize(); },
  };
}

test('units wait for script readiness and never push twice on the same mounted element', () => {
  const ad = adHarness({ status: 'loading' });
  assert.ok(ad.render());
  ad.runEffect();
  assert.equal(ad.requests, 0);
  ad.setStatus('ready');
  ad.render();
  ad.runEffect();
  ad.render();
  ad.runEffect();
  assert.equal(ad.requests, 1);
  const newPage = adHarness();
  newPage.render();
  newPage.runEffect();
  assert.equal(newPage.requests, 1, 'a fresh element after navigation can request its own ad');
});

test('zero-width containers wait for resize and observers are cleaned up', () => {
  const ad = adHarness({ width: 0 });
  ad.render();
  const cleanup = ad.runEffect();
  assert.equal(ad.requests, 0);
  ad.resize(320);
  ad.resize(600);
  assert.equal(ad.requests, 1);
  cleanup();
  assert.equal(ad.disconnected, true);
});

test('Google-filled elements are not requested again; ad failures remove only the ad', () => {
  const filled = adHarness({ filled: true });
  filled.render();
  filled.runEffect();
  assert.equal(filled.requests, 0);
  const blocked = adHarness({ throws: true });
  blocked.render();
  assert.doesNotThrow(() => blocked.runEffect());
  assert.equal(blocked.render(), null);
  const scriptFailed = adHarness({ status: 'failed' });
  assert.equal(scriptFailed.render(), null);
  scriptFailed.runEffect();
  assert.equal(scriptFailed.requests, 0);
});

test('unconfigured units leave no space; local placeholders never request ads', () => {
  const disabled = adHarness({ config: getAdsenseConfig({}) });
  assert.equal(disabled.render(), null);
  disabled.runEffect();
  assert.equal(disabled.requests, 0);
  const missingSlot = adHarness();
  assert.equal(missingSlot.render('generate'), null);
  const preview = adHarness({ config: getAdsenseConfig({ NODE_ENV: 'development', NEXT_PUBLIC_ADSENSE_PREVIEW: 'true' }) });
  assert.ok(preview.render());
  preview.runEffect();
  assert.equal(preview.requests, 0);
});

test('shared loader preserves page content and omits Google when disabled or previewing', () => {
  for (const env of [{}, { NODE_ENV: 'development', NEXT_PUBLIC_ADSENSE_PREVIEW: 'true' }, configured]) {
    const adsense = getAdsenseConfig(env);
    const Provider = load('src/app/components/AdSenseProvider.tsx', { '@/lib/adsense': { adsense },
      react: { createContext: () => ({ Provider: 'provider' }), useState: () => ['loading', () => {}] },
    }).default;
    const tree = Provider({ children: 'site content' });
    assert.equal(tree.props.children[1], 'site content');
    const script = tree.props.children[0];
    if (adsense.enabled) {
      assert.equal(script.props.id, 'google-adsense');
      assert.equal(script.props.strategy, 'afterInteractive');
      assert.match(script.props.src, /client=ca-pub-1234567890123456$/);
    } else assert.equal(script, false);
  }
});
