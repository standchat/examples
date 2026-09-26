import './stand-inline.js';
import { identities, projects, variants, decide, scenarioContext } from './policies.js';
import { ScenarioClient } from './conversation.js';

const $ = (selector) => document.querySelector(selector);
const defaults = { identityId: 'user_03', projectId: 'proj_01', variantId: 'assigned', topic: 'record', showDenied: true };
const state = { ...defaults };
// Keep the controls aligned with a restored conversation in this browser tab.
try {
  const saved = JSON.parse(sessionStorage.getItem('rowhaven:scenario:v1') || '{}');
  if (identities.some(i => i.id === saved.identityId)) state.identityId = saved.identityId;
  if (projects.some(p => p.id === saved.projectId)) state.projectId = saved.projectId;
  if (variants.some(v => v.id === saved.variantId)) state.variantId = saved.variantId;
  if (saved.topic === 'policy') state.topic = 'policy';
  if (typeof saved.showDenied === 'boolean') state.showDenied = saved.showDenied;
} catch { /* The preview also works when storage is unavailable. */ }

const client = new ScenarioClient(
  { site: 'demo', scope: 'rowhaven-permissions-v1' },
  () => scenarioContext(state)
);
const chat = document.createElement('stand-inline');
chat.id = 'scenario-chat';
chat.client = client;
chat.setAttribute('look', 'field');
chat.setAttribute('grow', 'unfold');
chat.setAttribute('placeholder', 'How should access work in your app?');
chat.setAttribute('label', 'Your permission question');
chat.setAttribute('analytics-id', 'rowhaven-scenario');
$('#chat-mount').append(chat);

function updateChatStatus(snapshot) {
  let label = '';
  if (snapshot.phase === 'loading') label = 'Checking Stand availability…';
  if (snapshot.phase === 'available') label = snapshot.host.kind === 'rep' ? 'A human responder is available. Send when you’re ready.' : 'Stand’s AI Stand-in is available. Send when you’re ready.';
  if (snapshot.phase === 'active') label = snapshot.connection === 'online' ? 'Live Stand conversation · current scenario attached on Send.' : 'Recovering the Stand connection…';
  if (snapshot.phase === 'unavailable') label = snapshot.error ? 'Stand could not be reached. Retry in the conversation panel.' : 'No responder is available. You can keep exploring and retry the chat.';
  if (snapshot.phase === 'uncertain') label = 'The chat start could not be confirmed. Review the recovery option before starting again.';
  if (snapshot.phase === 'ended') label = 'Conversation ended. A new conversation requires your action.';
  $('#chat-status').textContent = label;
}
client.subscribe(updateChatStatus);
updateChatStatus(client.getSnapshot());

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function render() {
  const scenario = scenarioContext(state);
  const { identity, selectedRecord: selected, contractorPolicy: variant, decisions } = scenario;
  for (const button of document.querySelectorAll('[data-identity]')) button.setAttribute('aria-pressed', String(button.dataset.identity === state.identityId));
  for (const button of document.querySelectorAll('[data-policy]')) button.setAttribute('aria-pressed', String(button.dataset.policy === state.variantId));
  $('#show-denied').checked = state.showDenied;
  const rows = document.createDocumentFragment();
  for (const project of projects) {
    const decision = decide(identity, project, variant.id);
    if (!decision.allowed && !state.showDenied) continue;
    const row = node('tr', `${decision.allowed ? '' : 'denied'} ${project.id === state.projectId ? 'selected' : ''}`);
    const cell = node('td');
    const button = node('button', 'row-button');
    button.type = 'button';
    button.dataset.project = project.id;
    button.setAttribute('aria-pressed', String(project.id === state.projectId));
    button.setAttribute('aria-label', `Inspect ${project.id}: ${decision.allowed ? project.name + ', visible' : 'restricted project, denied'}`);
    button.append(node('span', 'row-name', decision.allowed ? project.name : 'Restricted project'), node('span', 'row-id', project.id));
    cell.append(button);
    const accessCell = node('td');
    const access = node('span', `access ${decision.allowed ? '' : 'denied-access'}`, decision.allowed ? '✓ Visible' : '⊘ Denied');
    accessCell.append(access);
    row.append(cell, node('td', 'customer-cell', decision.allowed ? project.customerName : '—'), accessCell);
    rows.append(row);
  }
  $('#project-rows').replaceChildren(rows);
  const count = scenario.visibleRecords.length;
  $('#row-count').textContent = `${count} of ${projects.length} rows visible · ${projects.length - count} denied`;
  $('#identity-summary').textContent = `${identity.name} / ${identity.id}`;
  $('#policy-description').textContent = `${variant.description}${identity.role !== 'contractor' ? ' This variant does not change the selected ' + identity.role + '’s access.' : ''}`;
  const expression = variant.id === 'workspace' ? 'same_workspace && !archived' : 'same_workspace && !archived && assigned_to_me';
  $('#policy-expression').textContent = `contractor.read = ${expression}${variant.id === 'readonly' ? '\ncontractor.update = false' : '\ncontractor.update = same_workspace && !archived && assigned_to_me'}`;
  $('#selected-id').textContent = selected.id;
  $('#inspector-title').textContent = decisions.read.allowed ? selected.name : 'Restricted project';
  $('#read-decision').textContent = decisions.read.allowed ? '✓ Visible' : '⊘ Denied';
  $('#read-decision').className = `decision-pill ${decisions.read.allowed ? '' : 'denied-pill'}`;
  $('#selected-person').textContent = `to ${identity.name}`;
  $('#decision-reason').textContent = decisions.read.reason;
  $('#action-checks').replaceChildren(...Object.entries(decisions).map(([action, decision]) => node('span', decision.allowed ? 'allow' : 'deny', `${decision.allowed ? '✓' : '⊘'} ${action}`)));
  $('#context-preview').textContent = JSON.stringify(scenario, null, 2);
  $('#action-result').textContent = 'Test an action to see its local decision.';
  try { sessionStorage.setItem('rowhaven:scenario:v1', JSON.stringify(state)); } catch { /* Optional continuity. */ }
}

for (const button of document.querySelectorAll('[data-identity]')) button.addEventListener('click', () => {
  state.identityId = button.dataset.identity;
  render();
});
for (const button of document.querySelectorAll('[data-policy]')) button.addEventListener('click', () => {
  state.variantId = button.dataset.policy;
  state.topic = 'policy';
  render();
});
$('#project-rows').addEventListener('click', event => {
  const button = event.target.closest('[data-project]');
  if (!button) return;
  state.projectId = button.dataset.project;
  state.topic = 'record';
  render();
  $('#inspector-title').focus();
});
$('#show-denied').addEventListener('change', event => { state.showDenied = event.target.checked; render(); });
for (const action of ['update', 'delete']) $(`#try-${action}`).addEventListener('click', () => {
  const decision = scenarioContext(state).decisions[action];
  $('#action-result').textContent = `${decision.allowed ? 'Allowed' : 'Denied'} locally: ${action}. ${decision.reason} No data was changed.`;
});
$('#reset').addEventListener('click', () => { Object.assign(state, defaults); render(); });

function prepareQuestion(topic) {
  state.topic = topic;
  render();
  // Preserve an existing unsent question. These buttons never send a message.
  if (!chat.draft.trim()) chat.draft = topic === 'policy'
    ? 'Contractors should only see projects they are assigned to. What edge cases should I consider for my app?'
    : `Why is ${state.projectId} ${scenarioContext(state).decisions.read.allowed ? 'visible' : 'denied'} for this identity, and what would change that?`;
  chat.focus();
}
$('#ask-row').addEventListener('click', () => prepareQuestion('record'));
$('#ask-policy').addEventListener('click', () => prepareQuestion('policy'));
render();
