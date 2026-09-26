import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT, TOOLS, RECORDS, RULES, simulate, normalize, contextFor } from './scenario.js';

test('paid gate blocks trial records and keeps the destination action out of review', () => {
  assert.equal(simulate({ ...DEFAULT, rule: 'paid', sample: 'paid' }).route, 'action');
  const blocked = simulate({ ...DEFAULT, rule: 'paid', sample: 'trial' });
  assert.equal(blocked.route, 'stop'); assert.equal(blocked.passes, false);
  const review = simulate({ ...DEFAULT, rule: 'paid', sample: 'trial', branch: 'review' });
  assert.equal(review.route, 'review'); assert.equal(review.passes, false);
  assert.equal(simulate({ ...DEFAULT, rule: 'none', sample: 'trial', branch: 'review' }).route, 'action');
});

test('duplicate comparison handles whitespace and case without changing the fixture', () => {
  const fixture = JSON.stringify(RECORDS);
  assert.equal(simulate({ ...DEFAULT, rule: 'dedupe', sample: 'duplicate' }).route, 'stop');
  assert.equal(simulate({ ...DEFAULT, rule: 'dedupe', sample: 'paid' }).route, 'action');
  assert.deepEqual(simulate({ ...DEFAULT, rule: 'dedupe' }), simulate({ ...DEFAULT, rule: 'dedupe' }));
  assert.equal(JSON.stringify(RECORDS), fixture);
});

test('inclusive USD threshold has correct boundary, zero, and high-value results', () => {
  assert.equal(simulate({ ...DEFAULT, rule: 'amount', threshold: 240 }).route, 'action');
  assert.equal(simulate({ ...DEFAULT, rule: 'amount', threshold: 241 }).route, 'stop');
  assert.equal(simulate({ ...DEFAULT, rule: 'amount', threshold: 0, sample: 'trial' }).route, 'action');
  assert.equal(simulate({ ...DEFAULT, rule: 'amount', threshold: 1200, sample: 'large' }).route, 'action');
  assert.equal(simulate({ ...DEFAULT, rule: 'amount', threshold: 1201, sample: 'large' }).route, 'stop');
});

test('normalization rejects corrupt stored options and bounds numbers and free text', () => {
  assert.deepEqual(normalize({ source: '__proto__', target: 'no-such-tool', trigger: 'invalid', action: 'invalid', sample: 'missing', rule: 'constructor', threshold: Infinity, branch: 'anything', requirement: false }), DEFAULT);
  assert.equal(normalize({ threshold: -50 }).threshold, 0);
  assert.equal(normalize({ threshold: 10001 }).threshold, 10000);
  assert.equal(normalize({ threshold: 20.8 }).threshold, 21);
  assert.equal(normalize({ source: 'payments' }).trigger, 'Payment received');
  assert.equal(normalize({ target: 'chat' }).action, 'Post a message');
  assert.equal(normalize({ requirement: 'x'.repeat(600) }).requirement.length, 400);
});

test('all supported combinations are deterministic, bounded, and valid Stand context', () => {
  for (const source of Object.keys(TOOLS).filter(k => TOOLS[k].triggers.length)) {
    for (const target of Object.keys(TOOLS).filter(k => TOOLS[k].actions.length)) {
      for (const sample of Object.keys(RECORDS)) {
        for (const rule of Object.keys(RULES)) {
          for (const branch of ['stop', 'review']) {
            const config = normalize({ source, target, sample, rule, branch, requirement: 'x'.repeat(400), threshold: 10000 });
            const outcome = simulate(config);
            assert.ok(['action', 'stop', 'review'].includes(outcome.route));
            assert.deepEqual(outcome, simulate(config));
            const context = contextFor(config);
            assert.ok(context.length <= 2000, `${context.length} exceeds Stand prompt limit`);
            assert.ok(context.includes(TOOLS[source].name));
            assert.ok(context.includes(TOOLS[target].name));
            assert.ok(context.includes(config.trigger));
            assert.ok(context.includes(config.action));
            assert.ok(context.includes(RECORDS[sample].email));
            assert.ok(context.includes(config.requirement));
          }
        }
      }
    }
  }
});
