import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, defaults, normalize, compare, contextFor } from './model.js';

test('each possible dependency combination produces an honest, exhaustive partition', () => {
  for (const [id, tool] of Object.entries(TOOLS)) {
    for (let mask = 0; mask < 2 ** tool.items.length; mask++) {
      const requirements = tool.items.filter((_, index) => mask & (1 << index)).map(item => item[0]);
      const result = compare(id, requirements);
      assert.equal(result.selected.length, requirements.length);
      assert.equal(Object.values(result.counts).reduce((sum, n) => sum + n, 0), requirements.length);
      assert.equal(new Set(result.selected.map(item => item[0])).size, requirements.length);
      if (!requirements.length) assert.match(result.verdict, /Pick what/);
      else if (result.counts.keep) assert.match(result.verdict, /Keep a specialist/);
      else if (result.counts.workaround) assert.match(result.verdict, /manual steps/);
      else assert.match(result.verdict, /good fit/);
    }
  }
});
test('critical dependencies cannot be averaged away by supported features', () => {
  assert.equal(compare('sheets', ['tables', 'formulas']).counts.keep, 1);
  assert.match(compare('sheets', ['tables', 'formulas']).verdict, /Keep/);
  assert.match(compare('docs', ['pages', 'layout']).verdict, /manual steps/);
});

test('an unclassified feature note never silently becomes a supported feature', () => {
  assert.match(compare('docs', ['pages'], 'Custom document approval workflow').verdict, /needs a conversation/);
  assert.match(compare('docs', ['pages', 'offline'], 'Offline workflows').verdict, /Keep a specialist/);
});
test('stored data is normalized without prototype keys, duplicates, invalid dependencies or excessive notes', () => {
  const state = normalize({ selected: '__proto__', shelf: ['sheets', 'sheets', '__proto__', 'oops'], jobs: { sheets: { dependencies: ['tables', 'tables', 'bad'], missing: 'a'.repeat(500) } } });
  assert.deepEqual(state.shelf, ['sheets']); assert.equal(state.selected, 'sheets');
  assert.deepEqual(state.jobs.sheets.dependencies, ['tables']); assert.equal(state.jobs.sheets.missing.length, 240);
  assert.deepEqual(normalize({ shelf: [] }).shelf, ['docs']);
});
test('every maximal context fits the supported prompt limit and includes the real boundaries', () => {
  for (const [id, tool] of Object.entries(TOOLS)) {
    const state = defaults(); state.selected = id; state.shelf = Object.keys(TOOLS);
    state.jobs[id] = { dependencies: tool.items.map(item => item[0]), missing: '"'.repeat(240) };
    const prompt = contextFor(state);
    assert.ok(prompt.length <= 2000, `${id}: ${prompt.length}`);
    assert.ok(prompt.includes(tool.name)); assert.ok(prompt.includes(tool.job));
    assert.match(prompt, /No automatic migration/); assert.match(prompt, /unverified/);
    tool.items.forEach(item => assert.ok(prompt.includes(`REQUIRED: ${item[1]}`)));
  }
});
test('restoring a snapshot isolates it from later planner changes', () => {
  const state = defaults(); const snapshot = normalize(state);
  state.jobs.docs.dependencies.push('offline'); state.jobs.docs.missing = '<img src=x onerror=alert(1)>';
  assert.deepEqual(snapshot.jobs.docs.dependencies, ['pages']);
  assert.equal(snapshot.jobs.docs.missing, '');
});

test('control characters cannot overflow the context budget', () => {
  const state = defaults(); state.jobs.docs.missing = '\u0000'.repeat(240);
  assert.ok(contextFor(state).length <= 2000);
});
