import { TOOLS, RECORDS, RULES, DEFAULT, normalize, simulate, contextFor } from './scenario.js';
import { createThread } from './chat.js';

const $ = id => document.getElementById(id);
const storageKey = 'flowspoke:canvas:v1';
let config = { ...DEFAULT };
try { config = normalize(JSON.parse(sessionStorage.getItem(storageKey) || '{}')); } catch { /* The playground works without storage. */ }
const history = [];
let running = false;
let thread;
let runEpoch = 0;

function save() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(config)); } catch { /* In-memory operation. */ }
}

function update(patch) {
  const next = normalize({ ...config, ...patch });
  if (JSON.stringify(next) === JSON.stringify(config)) return;
  history.push({ ...config });
  if (history.length > 30) history.shift();
  config = next;
  clearRun();
  save();
  render();
}

function options(id, choices, value) {
  const el = $(id);
  if (JSON.stringify([...el.options].map(o => o.value)) !== JSON.stringify(choices)) {
    el.replaceChildren(...choices.map(choice => new Option(choice, choice)));
  }
  el.value = value;
}

function setIcon(id, tool) {
  const el = $(id);
  el.className = `tool-icon ${tool}`;
  el.querySelector('use').setAttribute('href', `#icon-${TOOLS[tool].icon}`);
}

function render() {
  for (const key of ['source', 'target', 'sample', 'threshold', 'branch', 'requirement']) {
    if ($(key).value !== String(config[key])) $(key).value = config[key];
  }
  options('trigger', TOOLS[config.source].triggers, config.trigger);
  options('action', TOOLS[config.target].actions, config.action);
  setIcon('source-icon', config.source);
  setIcon('target-icon', config.target);
  const hasRule = config.rule !== 'none';
  $('gate-name').textContent = hasRule ? RULES[config.rule] : 'The exception';
  $('gate-note').textContent = hasRule ? 'Passes? Keep it moving.' : 'Add your “but only if”';
  $('gate-link').textContent = hasRule ? '↗ Discuss this step' : '+ Add a rule';
  $('exception-node').classList.toggle('has-rule', hasRule);
  for (const button of document.querySelectorAll('[data-rule]')) {
    const selected = button.dataset.rule === config.rule;
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('b').textContent = selected ? '✓' : '+';
  }
  $('rule-config').hidden = !hasRule;
  $('threshold-label').hidden = config.rule !== 'amount';
  $('branch-lane').classList.toggle('active', hasRule && config.branch === 'review');
  $('branch-destination').hidden = !hasRule || config.branch !== 'review';
  $('branch-label').textContent = hasRule ? (config.branch === 'review' ? 'IF BLOCKED ↴' : 'If blocked → stop at step 02') : 'One clear path. Until life happens.';
  const record = RECORDS[config.sample];
  $('record-initials').textContent = record.name.split(' ').map(s => s[0]).join('');
  $('record-name').textContent = record.name;
  $('record-company').textContent = record.company;
  $('record-plan').textContent = record.plan.toUpperCase();
  $('record-plan').classList.toggle('trial', record.plan === 'trial');
  $('record-amount').firstChild.textContent = `$${record.amount.toLocaleString('en-US')}`;
  $('undo').disabled = !history.length;
  thread?.canvasChanged(config);
}

function clearRun() {
  runEpoch++;
  running = false;
  $('run').disabled = false;
  $('run').innerHTML = '<span aria-hidden="true">▶</span> Run sample';
  for (const node of document.querySelectorAll('.node,.branch-destination')) node.classList.remove('running', 'passed', 'blocked', 'skipped');
  for (const connector of document.querySelectorAll('.connector')) connector.classList.remove('travel');
  $('result').className = 'result';
  $('result-icon').textContent = '↳';
  $('result-title').textContent = 'Ready when you are.';
  $('result-detail').textContent = 'Run the sample to test this workflow. No service is connected.';
}

async function run() {
  if (running) return;
  clearRun();
  running = true;
  const epoch = runEpoch;
  const result = simulate(config);
  const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;
  const step = () => new Promise(resolve => setTimeout(resolve, delay));
  $('run').disabled = true;
  $('run').textContent = 'Running sample…';
  $('result-title').textContent = 'Following the sample…';
  $('result-detail').textContent = 'Trigger → exception → outcome. This stays in your browser.';
  $('source-node').classList.add('running');
  await step(); if (epoch !== runEpoch) return;
  $('source-node').classList.replace('running', 'passed');
  document.querySelector('.first').classList.add('travel');
  await step(); if (epoch !== runEpoch) return;
  document.querySelector('.first').classList.remove('travel');
  $('exception-node').classList.add('running');
  await step(); if (epoch !== runEpoch) return;
  $('exception-node').classList.replace('running', result.passes ? 'passed' : 'blocked');
  if (result.passes) {
    document.querySelector('.second').classList.add('travel');
    await step(); if (epoch !== runEpoch) return;
    document.querySelector('.second').classList.remove('travel');
    $('target-node').classList.add('passed');
  } else {
    $('target-node').classList.add('skipped');
    if (result.route === 'review') $('branch-destination').classList.add('passed');
  }
  $('result').className = `result ${result.passes ? 'success' : 'block'}`;
  $('result-icon').textContent = result.passes ? '✓' : result.route === 'review' ? '↳' : '⊘';
  $('result-title').textContent = result.title;
  $('result-detail').textContent = result.reason + (result.route === 'review' ? ' The main action is skipped; the sample goes to a fictional team queue.' : '');
  $('run').disabled = false;
  $('run').innerHTML = '<span aria-hidden="true">▶</span> Run again';
  running = false;
}

for (const key of ['source', 'target', 'trigger', 'action', 'sample', 'threshold', 'branch']) {
  $(key).addEventListener('change', () => update({ [key]: $(key).value }));
}
$('requirement').addEventListener('change', () => update({ requirement: $('requirement').value }));

function discuss({ focus = true } = {}) {
  // Commit the last edit before taking a snapshot, including keyboard activation.
  update({ requirement: $('requirement').value });
  thread.open(config, { focus });
}
for (const button of document.querySelectorAll('[data-rule]')) {
  button.addEventListener('click', () => {
    update({ rule: button.dataset.rule });
    discuss({ focus: false });
    $('announcement').textContent = `${RULES[config.rule]} added. A real Stand thread is now open below the canvas. No message has been sent.`;
  });
}
$('exception-node').addEventListener('click', () => {
  if (config.rule !== 'none') discuss();
  else {
    $('exception-panel').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    document.querySelector('[data-rule]').focus({ preventScroll: true });
  }
});
$('discuss').addEventListener('click', () => discuss());
$('remove-rule').addEventListener('click', () => { update({ rule: 'none' }); document.querySelector('[data-rule]').focus(); });
$('run').addEventListener('click', run);
$('reset').addEventListener('click', () => { update(DEFAULT); $('announcement').textContent = 'Playground reset. Your conversation and its attached snapshot are kept. Undo is available.'; });
$('undo').addEventListener('click', () => {
  if (!history.length) return;
  config = history.pop(); clearRun(); save(); render();
  $('announcement').textContent = 'Last canvas edit undone. Your conversation is unchanged.';
});

thread = createThread({ getConfig: () => config, contextFor });
render();
