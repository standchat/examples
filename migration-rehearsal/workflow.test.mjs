import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sample, rehearse, moveColumn, restoreBoard, contextFor } from './workflow.js';

test('default sample preserves labels and honestly leaves approval unresolved', () => {
  const board = sample(); const result = rehearse(board);
  assert.equal(result.clear, 4);
  assert.deepEqual(result.mappings.map(m => m.target), board.columns.map(c => c.name));
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].id, 'stage-4');
});
test('aliases normalize only when custom statuses are not required', () => {
  const board = sample('simple'); board.requirements = [];
  assert.deepEqual(rehearse(board).mappings.map(m => m.target), ['Ready', 'In progress', 'Done']);
  board.requirements = ['custom'];
  assert.deepEqual(rehearse(board).mappings.map(m => m.target), ['To do', 'Doing', 'Done']);
});
test('ambiguous, blank, duplicate, and out-of-order completed stages remain decisions', () => {
  const board = { ...sample(), columns: ['Done', 'QA', 'qa', 'Blocked', ''].map((name, i) => ({ id: `x${i}`, name })), requirements: [] };
  const result = rehearse(board);
  assert.equal(result.clear, 0);
  assert.equal(result.decisions.length, 5);
  assert.match(result.mappings[0].reason, /before/);
  assert.match(result.mappings[1].reason, /Repeated/);
  assert.equal(result.mappings[3].target, 'Blocked');
});
test('non-negotiables add separate decisions without inserting unrequested stages', () => {
  const board = sample('simple'); board.requirements = ['reporting', 'approvals'];
  const result = rehearse(board);
  assert.equal(result.mappings.length, 3);
  assert.deepEqual(result.decisions.map(d => d.id), ['reporting', 'approvals']);
});
test('reorder preserves identity and data without mutating the prior board', () => {
  const columns = sample().columns;
  const moved = moveColumn(columns, columns[4].id, 0);
  assert.equal(moved[0].name, 'Done'); assert.equal(columns[0].name, 'Backlog');
  assert.equal(new Set(moved.map(c => c.id)).size, 5);
  assert.equal(moveColumn(columns, 'missing', 0), columns);
  assert.equal(moveColumn(columns, columns[0].id, -1), columns);
  assert.match(rehearse({ ...sample(), columns: moved }).decisions[0].detail, /before/);
});
test('context captures current scenario, selected mapping, choices, and limits', () => {
  const board = sample('delivery'); board.requirements.push('reporting');
  board.columns[0].name = '<script>not executable</script>';
  const context = contextFor(board, 'stage-4');
  assert.match(context, /Client delivery/); assert.match(context, /Client sign-off/);
  assert.match(context, /Reporting/); assert.match(context, /no tickets, permissions/);
  assert.match(context, /<script>not executable<\/script>/);
  assert.match(contextFor(board, 'reporting'), /Selected: Reporting parity/);
});
test('corrupt storage falls back; oversized fields and invalid choices are bounded', () => {
  assert.deepEqual(restoreBoard({ columns: [] }), sample());
  const board = restoreBoard({ scenario: '__proto__', columns: [{ id: 'same', name: 'x'.repeat(70) }, { id: 'same', name: null }], requirements: ['approvals', 'nope'] });
  assert.equal(board.scenario, 'product'); assert.equal(board.columns[0].name.length, 40);
  assert.equal(new Set(board.columns.map(c => c.id)).size, 2);
  assert.deepEqual(board.requirements, ['approvals']);
});
