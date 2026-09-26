import test from 'node:test';
import assert from 'node:assert/strict';
import { identities, projects, variants, decide, scenarioContext } from './policies.js';
import { contextualMessage, CONTEXT_MARKER } from './conversation.js';

// Explicit expected sets, independent of the rule implementation. Indexes are
// project numbers 1–6. A complete matrix catches read/write inconsistencies.
const expected = {
  customer: { assigned: [[1, 3], [], []], workspace: [[1, 3], [], []], readonly: [[1, 3], [], []] },
  teammate: { assigned: [[1, 2, 3, 5], [1, 2, 3, 5], []], workspace: [[1, 2, 3, 5], [1, 2, 3, 5], []], readonly: [[1, 2, 3, 5], [1, 2, 3, 5], []] },
  contractor: { assigned: [[1, 2], [1, 2], []], workspace: [[1, 2, 3, 5], [1, 2], []], readonly: [[1, 2], [], []] },
  administrator: { assigned: [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]], workspace: [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]], readonly: [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]] },
};

for (const identity of identities) for (const variant of variants) test(`${identity.role} / ${variant.name}: all records and actions`, () => {
  for (const [index, action] of ['read', 'update', 'delete'].entries()) for (const [projectIndex, project] of projects.entries()) {
    const result = decide(identity, project, variant.id, action);
    assert.equal(result.allowed, expected[identity.role][variant.id][index].includes(projectIndex + 1), `${project.id} ${action}`);
    assert.ok(result.reason.length > 15);
    if (result.allowed && action !== 'read') assert.ok(decide(identity, project, variant.id, 'read').allowed, 'writes require read access in this model');
  }
});

test('workspace, archive, customer sharing, and assignment gates remain independent', () => {
  for (const identity of identities) for (const variant of variants) for (const action of ['read', 'update', 'delete']) {
    assert.equal(decide(identity, { ...projects[0], workspace: 'outside' }, variant.id, action).allowed, false);
    if (identity.role !== 'administrator') assert.equal(decide(identity, { ...projects[0], archived: true }, variant.id, action).allowed, false);
  }
  assert.equal(decide(identities[0], { ...projects[0], shared: false }).allowed, false);
  assert.equal(decide(identities[0], { ...projects[0], customer: 'someone_else' }).allowed, false);
  assert.equal(decide(identities[2], { ...projects[0], assigned: [] }).allowed, false);
  assert.equal(decide(identities[2], { ...projects[0], assigned: [] }, 'workspace').allowed, true);
  assert.equal(decide(identities[2], { ...projects[0], assigned: [] }, 'workspace', 'update').allowed, false);
});

test('unknown identities, roles, actions, and variants fail closed', () => {
  assert.equal(decide(null, projects[0]).allowed, false);
  assert.equal(decide(identities[0], null).allowed, false);
  assert.equal(decide({ ...identities[3], role: 'unknown' }, projects[0]).allowed, false);
  assert.equal(decide(identities[3], projects[0], 'unknown').allowed, false);
  assert.equal(decide(identities[3], projects[0], 'assigned', 'execute').allowed, false);
});

test('every message snapshot includes current scenario and leaves arbitrary input as text', () => {
  const a = scenarioContext({ identityId: 'user_03', projectId: 'proj_03', variantId: 'assigned' });
  const b = scenarioContext({ identityId: 'user_03', projectId: 'proj_03', variantId: 'workspace', topic: 'policy' });
  assert.equal(a.decisions.read.allowed, false);
  assert.equal(b.decisions.read.allowed, true);
  assert.equal(b.decisions.update.allowed, false);
  assert.equal(b.discussion, 'contractor policy');
  assert.deepEqual(b.visibleRecords, ['proj_01', 'proj_02', 'proj_03', 'proj_05']);
  assert.match(b.assumptions, /No real authentication/);
  const input = '<img src=x onerror=alert(1)> What about contractors?';
  const body = contextualMessage(input, a);
  assert.equal(body.split(CONTEXT_MARKER)[0], input);
  const recovered = contextualMessage(body, b);
  assert.equal(recovered.split(CONTEXT_MARKER).length, 2);
  assert.deepEqual(JSON.parse(recovered.split(CONTEXT_MARKER)[1]), b);
  assert.equal(contextualMessage('  ', b), '');
});
