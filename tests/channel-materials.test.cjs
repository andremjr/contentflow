const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const materials = JSON.parse(fs.readFileSync(path.join(root, 'channel-materials.json'))).materials;
const script = fs.readFileSync(path.join(root, 'ecosystem.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'ecosystem/index.html'), 'utf8');

function harness(lang, failExternal = false) {
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, { value: key.includes('filter') ? 'all' : '', dataset: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener() {}, querySelectorAll() { return []; } });
    return elements.get(key);
  };
  const context = vm.createContext({
    URL, URLSearchParams, Set, setTimeout,
    location: { search: '?category=materials', href: 'https://example.org/contentflow/ecosystem/?category=materials' },
    history: { replaceState() {} },
    localStorage: { getItem: () => lang, setItem() {} },
    document: { baseURI: 'https://example.org/contentflow/', documentElement: {}, querySelector: element, querySelectorAll: () => [] },
    fetch: async url => {
      if (String(url).endsWith('channel-materials.json')) return { ok: true, json: async () => ({ materials }) };
      if (failExternal) throw new Error('offline');
      return { ok: true, json: async () => ({ plugins: [], methods: [] }) };
    },
  });
  vm.runInContext(script, context);
  return { context, element };
}

test('every UI translation and material description exists in Portuguese, English and Spanish', () => {
  const { context } = harness('pt');
  const words = vm.runInContext('words', context);
  const keys = [...html.matchAll(/data-i18n(?:-placeholder|-aria)?="([^"]+)"/g)].map(match => match[1]);
  keys.push('selectItem', 'skill', 'prompts');
  for (const lang of ['pt', 'en', 'es']) {
    for (const key of keys) assert.ok(words[lang][key], `${lang}: ${key}`);
    for (const item of materials) assert.ok(item.description[lang]);
  }
});

for (const [lang, label, download] of [['pt', 'Materiais do canal', 'Baixar'], ['en', 'Channel materials', 'Download'], ['es', 'Materiales del canal', 'Descargar']]) {
  test(`material cards render and search in ${lang}, even when external catalogs fail`, async () => {
    const { context, element } = harness(lang, true);
    await new Promise(resolve => setImmediate(resolve));
    const rendered = element('#gallery').innerHTML;
    assert.equal(vm.runInContext('words[language].materials', context), label);
    assert.equal((rendered.match(/<article/g) || []).length, 2);
    assert.ok(rendered.includes(`>${download}</a>`));
    assert.ok(rendered.includes(materials[0].description[lang]));
    assert.ok(rendered.includes(materials[1].name));
    assert.equal(element('#delivery-filter').hidden, true);
    assert.equal(element('#process-filter').hidden, true);
    element('#search').value = 'prompts';
    vm.runInContext('render()', context);
    assert.equal((element('#gallery').innerHTML.match(/<article/g) || []).length, 1);
    vm.runInContext('kind = "plugins"; render()', context);
    assert.equal(element('#delivery-filter').hidden, false);
  });
}

test('downloads exist and six prompts stay in one TXT in the original order', () => {
  for (const material of materials) assert.ok(fs.statSync(path.join(root, material.downloadUrl)).size > 0);
  const txtMaterials = materials.filter(item => item.format === 'TXT');
  assert.equal(txtMaterials.length, 1);
  const text = fs.readFileSync(path.join(root, txtMaterials[0].downloadUrl), 'utf8').replace(/^\uFEFF/, '');
  assert.deepEqual([...text.matchAll(/^Prompt (\d) —/gm)].map(match => match[1]), ['1','2','3','4','5','6']);
  assert.ok(text.includes('O ideal é executar todos na mesma conversa'));
  assert.ok(!text.includes('```'));
});
