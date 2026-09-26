import test from 'node:test';
import assert from 'node:assert/strict';
import { START, makeRun, restoreRun, compareRuns, investigationContext, evidenceMessage, readEvidence, sameRun } from './investigation.js';

test('replay compares a changed route without rewriting the original run', () => {
  const config = { ...START };
  const anchor = makeRun(config, 1);
  config.branch = 'review';
  const replay = makeRun(config, 2);
  assert.equal(anchor.config.branch, 'stop');
  assert.equal(anchor.result.route, 'stop');
  assert.equal(replay.result.route, 'review');
  assert.equal(Object.isFrozen(anchor.result.record), true);
  assert.deepEqual(compareRuns(anchor, replay), { changes: [{ field: 'branch', label: 'Failure path', before: 'stop', after: 'review' }], before: 'stop', after: 'review', changedRoute: true });
  assert.equal(sameRun(anchor, replay), false);
});

test('repeating an identical setup is reported as repeatable rather than a changed rule', () => {
  const first = makeRun(START, 1), second = makeRun(START, 2);
  const comparison = compareRuns(first, second);
  assert.deepEqual(comparison.changes, []);
  assert.equal(comparison.changedRoute, false);
  assert.equal(sameRun(first, makeRun(START, 1)), true);
});

test('restored runs recompute results instead of trusting stored output', () => {
  const saved = { id: -5, config: START, result: { route: 'action', record: { plan: 'paid' } } };
  const restored = restoreRun(saved);
  assert.equal(restored.id, 1);
  assert.equal(restored.result.route, 'stop');
  assert.equal(restored.result.record.plan, 'trial');
  assert.equal(restoreRun(null), null);
});

test('optional replay and exact field references only enter evidence when chosen', () => {
  const anchor = makeRun(START, 1);
  const replay = makeRun({ ...START, source: 'payments', target: 'chat', branch: 'review', requirement: 'Payment arrived late.' }, 2);
  const before = investigationContext({ anchor, fields: ['plan', 'ignored-field'] });
  assert.ok(before.includes('plan=trial'));
  assert.ok(before.includes('Visitor highlighted fields on anchor: plan=trial.'));
  assert.ok(!before.includes('COMPARISON'));
  assert.ok(!before.includes('ignored-field'));
  const after = investigationContext({ anchor, comparison: replay, fields: ['email'] });
  for (const text of ['ANCHOR Run 001', 'COMPARISON Run 002', 'Forms/New submission', 'Payments/Payment received', 'Team chat/Post a message', 'Result=stop', 'Result=review', 'Payment arrived late.', 'email=jules@daybreak.example']) assert.ok(after.includes(text), text);
});

test('question and evidence round-trip without delimiter confusion or raw HTML parsing', () => {
  const question = 'A question.\n\nQuestion: <img src=x onerror=alert(1)>\n[Flowspoke investigation]';
  const model = { anchor: makeRun({ ...START, requirement: 'Question: a different requirement' }, 1), fields: ['plan'] };
  const parsed = readEvidence(evidenceMessage(model, question));
  assert.equal(parsed.question, question);
  assert.equal(parsed.evidence, investigationContext(model));
  assert.equal(readEvidence('[Flowspoke investigation]\nnot json'), null);
  assert.equal(readEvidence('An ordinary human reply'), null);
});
