import { TOOLS, RULES, normalize } from './scenario.js';
import { START, makeRun, restoreRun, runLabel } from './investigation.js';
import { createThread } from './chat.js';

const $ = id => document.getElementById(id);
const storageKey = 'flowspoke:desk:v2';
let config = { ...START };
let latest = makeRun(config);
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
  if (saved) { config = normalize(saved.config); latest = restoreRun(saved.latest) || latest; }
} catch { /* The desk works without storage. */ }
const history = [];
let running = false;
let epoch = 0;
let thread;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sameConfig = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function save() {
  try { sessionStorage.setItem(storageKey, JSON.stringify({ config, latest })); } catch { /* In-memory operation. */ }
}

function stopAnimation() {
  epoch++;
  running = false;
  $('run').disabled = false;
  $('run').innerHTML = '<span aria-hidden="true">▶</span> Replay flow';
  document.querySelectorAll('.running,.travel').forEach(node => node.classList.remove('running', 'travel'));
}

function update(patch) {
  const next = normalize({ ...config, ...patch });
  if (sameConfig(next, config)) return;
  history.push({ ...config }); if (history.length > 30) history.shift();
  config = next;
  stopAnimation(); save(); render();
}

function options(id, values, selected) {
  const el = $(id);
  if (JSON.stringify([...el.options].map(o => o.value)) !== JSON.stringify(values)) el.replaceChildren(...values.map(value => new Option(value, value)));
  el.value = selected;
}

function icon(id, tool) {
  $(id).className = `tool-icon ${tool}`;
  $(id).querySelector('use').setAttribute('href', `#icon-${TOOLS[tool].icon}`);
}

function render() {
  for (const key of ['source', 'target', 'rule', 'sample', 'threshold', 'branch', 'requirement']) if ($(key).value !== String(config[key])) $(key).value = config[key];
  options('trigger', TOOLS[config.source].triggers, config.trigger);
  options('action', TOOLS[config.target].actions, config.action);
  icon('source-icon', config.source); icon('target-icon', config.target);
  $('threshold-label').hidden = config.rule !== 'amount';
  $('gate-name').textContent = RULES[config.rule];
  $('predicate').textContent = ({ none: 'every record passes', paid: 'plan = paid', dedupe: 'email does not exist', amount: `amount ≥ $${config.threshold.toLocaleString('en-US')}` })[config.rule];
  const stale = !sameConfig(config, latest.config);
  const r = latest.result;
  $('run-caption').textContent = `${runLabel(latest).toUpperCase()} / SIMULATED`;
  $('edit-status').textContent = stale ? 'Setup changed · replay to test it' : 'No services connected';
  $('source-status').textContent = stale ? '○ Ready to replay' : '✓ Record received';
  $('target-status').textContent = stale ? '○ Waiting for replay' : r.passes ? '✓ Action simulated' : '— Action skipped';
  $('target-node').classList.toggle('skipped', !stale && !r.passes);
  $('exception-node').classList.toggle('passed', !stale && r.passes);
  $('gate-outcome').textContent = stale ? 'Replay this change first ↻' : r.route === 'stop' ? 'Record stopped here ↙' : r.route === 'review' ? 'Routed to team review ↙' : 'Passed · inspect this step ↙';
  $('undo').disabled = history.length === 0;
}

async function replay() {
  if (running) return;
  update({ requirement: $('requirement').value });
  stopAnimation();
  const runEpoch = epoch;
  const candidate = makeRun(config, latest.id + 1);
  const pause = () => new Promise(resolve => setTimeout(resolve, reduced() ? 0 : 440));
  running = true; $('run').disabled = true; $('run').textContent = 'Following record…';
  $('rule-settings').open = false;
  $('source-node').classList.add('running');
  await pause(); if (runEpoch !== epoch) return;
  $('source-node').classList.remove('running'); $('first-wire').classList.add('travel');
  await pause(); if (runEpoch !== epoch) return;
  $('first-wire').classList.remove('travel'); $('exception-node').classList.add('running');
  await pause(); if (runEpoch !== epoch) return;
  $('exception-node').classList.remove('running');
  if (candidate.result.passes) {
    $('second-wire').classList.add('travel'); await pause(); if (runEpoch !== epoch) return;
    $('second-wire').classList.remove('travel'); $('target-node').classList.add('running');
    await pause(); if (runEpoch !== epoch) return;
  }
  latest = candidate; stopAnimation(); save(); render();
  thread.offerRun(latest);
  $('announcement').textContent = `${runLabel(latest)}: ${latest.result.title}. A local comparison is available in the investigation. Nothing was sent.`;
}

for (const key of ['source', 'target', 'trigger', 'action', 'rule', 'sample', 'threshold', 'branch']) $(key).addEventListener('change', () => update({ [key]: $(key).value }));
$('requirement').addEventListener('change', () => update({ requirement: $('requirement').value }));
$('run').addEventListener('click', replay);
$('exception-node').addEventListener('click', async () => {
  if (!sameConfig(config, latest.config)) await replay();
  thread.focus();
});
$('undo').addEventListener('click', () => {
  if (!history.length) return;
  config = history.pop(); stopAnimation(); save(); render();
  $('announcement').textContent = 'Setup edit undone. Completed runs and the conversation are unchanged.';
});
$('reset').addEventListener('click', () => {
  update(START); $('announcement').textContent = 'Setup reset. Completed runs and the investigation are kept. Replay to test the setup.';
});

render();
thread = createThread({ initialRun: latest });
