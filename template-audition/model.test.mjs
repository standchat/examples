import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, restoreState, markSection, briefText, conversationText } from './model.js';

test('template choices are independent and editing status retains explicit comments', () => {
  const state = initialState();
  markSection(state, 'field', 'introduction', 'wrong');
  state.choices['field:introduction'].reason = 'story';
  state.choices['field:introduction'].comment = 'Lead with a practical outcome.';
  markSection(state, 'signal', 'introduction', 'keep');
  markSection(state, 'field', 'introduction', 'missing');
  assert.deepEqual(state.choices['field:introduction'], { status: 'missing', reason: 'story', comment: 'Lead with a practical outcome.' });
  assert.equal(state.choices['signal:introduction'].status, 'keep');
  markSection(state, 'field', 'introduction', 'clear');
  assert.equal(Object.keys(state.choices).length, 1);
  assert.throws(() => markSection(state, '__proto__', 'introduction', 'keep'));
});

test('storage recovery validates untrusted keys and caps visitor input', () => {
  const restored = restoreState({ name: 'a'.repeat(90), description: 'b'.repeat(300), template: '__proto__', device: 'huge', notes: 'c'.repeat(900), choices: { 'field:introduction': { status: 'wrong', reason: 'invented', comment: 'x'.repeat(999) }, 'field:unknown': { status: 'keep' }, 'signal:story': null } });
  assert.equal(restored.name.length, 60); assert.equal(restored.description.length, 240);
  assert.equal(restored.notes.length, 500); assert.equal(restored.template, 'field'); assert.equal(restored.device, 'desktop');
  assert.deepEqual(Object.keys(restored.choices), ['field:introduction']);
  assert.equal(restored.choices['field:introduction'].reason, 'visual');
  assert.equal(restored.choices['field:introduction'].comment.length, 300);
  assert.deepEqual(restoreState(null), initialState());
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(restored))), restored);
});

test('conversation includes current business, target section, preferences, question and honest assumptions', () => {
  const state = initialState();
  state.name = '<img src=x onerror=alert(1)>';
  state.template = 'signal'; state.notes = 'No invented testimonials.';
  markSection(state, 'form', 'story', 'wrong');
  state.choices['form:story'].reason = 'story';
  state.choices['form:story'].comment = 'Explain our scheduling product.';
  const sent = conversationText(state, 'form', 'story', '  What should this say? ');
  assert.match(sent, /^My question: What should this say\?/);
  assert.match(sent, /About: Good Form \/ The story/);
  assert.match(sent, /Currently auditioning: Signal/);
  assert.match(sent, /WRONG — The story it tells; Explain our scheduling product\./);
  assert.ok(sent.includes(state.name));
  assert.ok(sent.includes(state.notes));
  assert.match(sent, /Chat advice never edits the page/);
  state.notes = 'Changed my mind: focus on ease.';
  const next = conversationText(state, 'form', 'story', 'And now?');
  assert.ok(next.includes(state.notes)); assert.ok(!next.includes('No invented testimonials.'));
});

test('brief exports only explicit choices; new reset states share no mutable choices', () => {
  const state = initialState();
  assert.match(briefText(state), /No sections marked yet/);
  markSection(state, 'signal', 'invitation', 'keep');
  assert.match(briefText(state), /Signal \/ The invitation: KEEP/);
  assert.doesNotMatch(briefText(state), /KEEP —/);
  assert.deepEqual(initialState().choices, {});
});


test('an explicit retry refreshes the recovered context without nesting the previous brief', () => {
  const state = initialState();
  const sent = conversationText(state, 'field', 'story', 'How can the story fit better?');
  state.name = 'New direction';
  state.notes = 'Use the latest choice.';
  const retry = conversationText(state, 'field', 'story', sent);
  assert.equal(retry, conversationText(state, 'field', 'story', 'How can the story fit better?'));
  assert.equal(retry.split('FOLDCRAFT / DESIGN BRIEF').length, 2);
  assert.ok(!retry.includes('Sunday Supply'));
});
