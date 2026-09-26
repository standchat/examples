import { TOOLS, STATUS, SITE_ID, defaults, normalize, compare, contextFor } from './model.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'dayfolio:planner:v1';
let saved;
try { saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY)); } catch { /* Storage is optional. */ }
let state = normalize(saved?.planner);
const snapshots = {};
for (const id of Object.keys(TOOLS)) {
  if (saved?.snapshots?.[id]) snapshots[id] = normalize(saved.snapshots[id]);
}
const clients = new Map();
const chats = new Map();
let chatReady = false;
let dragged = '';

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function save() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ planner: state, snapshots })); } catch { /* Keep working in memory. */ }
}
function announce(text) { $('announcement').textContent = text; }
function locked(id) {
  const s = clients.get(id)?.getSnapshot();
  return Boolean(s && (s.busy || ['active', 'uncertain'].includes(s.phase) || (s.phase === 'loading' && snapshots[id])));
}
function icon(id) {
  const paths = {
    docs: 'M7 3h16l7 7v27H7ZM23 3v8h7M12 17h13M12 23h13M12 29h8',
    wiki: 'M3 8q9-4 16 1 7-5 16-1v25q-9-4-16 1-7-5-16-1ZM19 9v25M8 15l6 1M8 21l6 1M24 16l6-1M24 22l6-1',
    tasks: 'M5 6h28v29H5ZM10 13l2 2 4-5M21 13h7M10 23l2 2 4-5M21 23h7',
    sheets: 'M4 6h30v29H4ZM4 15h30M4 25h30M14 6v29M24 15v20',
    notes: 'M6 5h27v26H21l-7 6v-6H6ZM12 12h15M12 18h15M12 24h8'
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 38 40'); svg.setAttribute('class', 'tool-icon'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[id]); svg.append(path); return svg;
}
function renderShelf() {
  $('shelf').replaceChildren(...Object.entries(TOOLS).map(([id, tool]) => {
    const included = state.shelf.includes(id);
    const card = node('div', `tool-card${included ? ' on-shelf' : ''}${id === state.selected ? ' active' : ''}`);
    card.dataset.tool = id; card.draggable = included;
    const top = node('div', 'tool-card-top');
    const label = node('label', 'tool-add');
    const input = node('input'); input.type = 'checkbox'; input.checked = included;
    input.setAttribute('aria-label', `Include ${tool.name} on my shelf`);
    input.disabled = locked(id) || (included && state.shelf.length === 1);
    input.addEventListener('change', () => {
      if (input.checked) state.shelf.push(id);
      else state.shelf = state.shelf.filter(key => key !== id);
      if (!state.shelf.includes(state.selected)) state.selected = state.shelf[0];
      save(); render();
      $('shelf').querySelector(`[data-tool="${id}"] input`).focus();
      announce(`${tool.name} ${input.checked ? 'added to' : 'removed from'} your shelf.`);
    });
    label.append(input, node('span', '', included ? 'On shelf' : 'Add'));
    top.append(icon(id), label); card.append(top, node('h3', '', tool.name));
    const button = node('button', 'compare-button', included ? (id === state.selected ? 'On the desk' : 'Compare') : 'Add & compare');
    button.setAttribute('aria-label', `Compare ${tool.name}`); button.setAttribute('aria-pressed', String(id === state.selected));
    button.append(node('span', '', id === state.selected ? '↙' : '↗'));
    button.addEventListener('click', () => select(id, true));
    card.addEventListener('dragstart', event => {
      if (!included) return event.preventDefault();
      dragged = id; event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { dragged = ''; $('desk').classList.remove('drag-over'); });
    card.append(button); return card;
  }));
}
function select(id, focus = false) {
  if (!Object.hasOwn(TOOLS, id)) return;
  if (!state.shelf.includes(id)) state.shelf.push(id);
  state.selected = id; save(); render();
  announce(`${TOOLS[id].name} is on the desk. Your comparison and conversation are attached to this tool.`);
  if (focus) {
    $('shelf').querySelector(`[data-tool="${id}"] button`).focus({ preventScroll: true });
    if (matchMedia('(max-width:700px)').matches) $('desk').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
}
$('desk').addEventListener('dragover', event => {
  if (!dragged || !state.shelf.includes(dragged)) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'move'; $('desk').classList.add('drag-over');
});
$('desk').addEventListener('dragleave', event => { if (!$('desk').contains(event.relatedTarget)) $('desk').classList.remove('drag-over'); });
$('desk').addEventListener('drop', event => {
  event.preventDefault(); $('desk').classList.remove('drag-over');
  if (dragged && event.dataTransfer.getData('text/plain') === dragged) select(dragged);
  dragged = '';
});
function renderSample() {
  const id = state.selected, t = TOOLS[id], root = $('sample');
  $('workspace-current').textContent = t.label;
  root.replaceChildren(node('p', 'sample-kicker', t.label.toUpperCase()), node('h3', '', t.title), node('p', 'sample-intro', t.intro));
  if (id === 'tasks') {
    const board = node('div', 'sample-board');
    [['UP NEXT', 'Write the welcome note'], ['IN PROGRESS', 'Try the first prototype'], ['DONE', 'Agree on the small things']].forEach(([title, text]) => {
      const col = node('div'); col.append(node('b', '', title), node('p', '', text)); board.append(col);
    }); root.append(board);
  } else if (id === 'sheets') {
    const table = node('table', 'sample-table'); table.setAttribute('aria-label', 'Sample content tracker');
    const head = node('thead'), hr = node('tr'); ['Story', 'Owner', 'Status'].forEach(t => hr.append(node('th', '', t))); head.append(hr);
    const body = node('tbody'); [['Studio notes', 'Lee', 'Draft'], ['A fresh start', 'Jules', 'Review'], ['Little rituals', 'Alex', 'Ready']].forEach(items => { const row = node('tr'); items.forEach(t => row.append(node('td', '', t))); body.append(row); }); table.append(head, body); root.append(table);
  } else {
    const callout = node('div', 'sample-callout'); callout.append(node('span', '', '✳'), node('span', '', id === 'wiki' ? 'A good answer is one everyone can find.' : id === 'notes' ? 'One decision. One owner. A clear next step.' : 'Make something small that feels considered.')); root.append(callout);
    const list = node('div', 'sample-list');
    const rows = id === 'wiki' ? [['Start here', 'Team'], ['How we make decisions', 'Lee'], ['Our working rhythm', 'Jules']] : id === 'notes' ? [['What moved forward?', '10 min'], ['What needs a decision?', '10 min'], ['Who takes the next step?', '5 min']] : [['Gather the first ideas', 'Lee'], ['Make room for feedback', 'Jules'], ['Share it with the team', 'Friday']];
    rows.forEach(([name, meta]) => { const row = node('div', 'sample-row'); row.append(node('i'), node('span', '', name), node('span', '', meta)); list.append(row); }); root.append(list);
  }
}
function renderDependencies() {
  const id = state.selected, job = state.jobs[id];
  $('dependencies').replaceChildren(node('legend', 'sr-only', 'Required features'), ...TOOLS[id].items.map(([key, label, status]) => {
    const row = node('label', 'dependency-choice'); const box = node('input'); box.type = 'checkbox'; box.value = key; box.checked = job.dependencies.includes(key); box.disabled = locked(id);
    box.addEventListener('change', () => {
      if (locked(id)) return;
      job.dependencies = box.checked ? [...job.dependencies, key] : job.dependencies.filter(k => k !== key);
      save(); renderResults(); updateContext();
    });
    const hint = node('span', '', status === 'fits' ? '✓' : status === 'workaround' ? '↗' : '—'); hint.setAttribute('aria-hidden', 'true');
    row.append(box, node('span', '', label), hint); return row;
  }));
  $('missing').value = job.missing; updateLocks();
}
$('missing').addEventListener('input', () => {
  if (locked(state.selected)) return;
  state.jobs[state.selected].missing = $('missing').value.slice(0, 240); save(); renderResults(); updateContext();
});
function renderResults() {
  const job = state.jobs[state.selected];
  const result = compare(state.selected, job.dependencies, job.missing);
  $('verdict').textContent = result.verdict;
  $('results').replaceChildren(...result.selected.map(([, label, status, detail]) => {
    const row = node('div', 'result'); const p = node('p'); p.append(node('strong', '', label), document.createTextNode(detail)); row.append(node('span', `result-status ${status}`, STATUS[status]), p); return row;
  }));
  if (!result.selected.length) $('results').append(node('p', 'muted', 'Select at least one dependency above. An empty list is not a recommendation.'));
  if (job.missing.trim()) {
    const row = node('div', 'result'); const p = node('p');
    p.append(node('strong', '', job.missing), document.createTextNode('This feature note is not classified by the local rules. Talk it through below.'));
    row.append(node('span', 'result-status workaround', 'Needs discussion'), p); $('results').append(row);
  }
}
function updateContext() {
  const id = state.selected;
  const context = snapshots[id] && locked(id) ? snapshots[id] : state;
  chats.get(id)?.setAttribute('prompt', contextFor(context));
  $('chat-context').textContent = `Attached to ${TOOLS[id].name.toLowerCase()} · ${TOOLS[id].job}. ${locked(id) ? 'This chat keeps the assumptions you started with.' : 'Your selected needs travel with your first question.'}`;
}
function updateLocks() {
  const isLocked = locked(state.selected);
  $('dependencies').disabled = isLocked;
  // Clear individual disabled values too after a conversation ends.
  $('dependencies').querySelectorAll('input').forEach(box => { box.disabled = isLocked; });
  $('missing').disabled = isLocked;
  $('lock-note').textContent = isLocked ? 'This comparison is attached to your chat. End it below to edit these assumptions.' : 'Your choices stay in this tab until you send a message.';
  const anyLocked = Object.keys(TOOLS).some(locked);
  $('reset').disabled = anyLocked;
  $('reset').title = anyLocked ? 'End your active tool conversations before resetting the planner.' : 'Reset the shelf, feature selections, and notes.';
  $('shelf').querySelectorAll('input').forEach(box => {
    const id = box.closest('[data-tool]').dataset.tool;
    box.disabled = locked(id) || (state.shelf.includes(id) && state.shelf.length === 1);
  });
  updateContext();
}
function mountChat() {
  if (!chatReady) return;
  const id = state.selected;
  if (!chats.has(id)) {
    const chat = document.createElement('stand-inline');
    chat.id = `chat-${id}`;
    chat.setAttribute('site', SITE_ID); chat.setAttribute('scope', `dayfolio-${id}`);
    chat.setAttribute('look', 'field'); chat.setAttribute('grow', 'unfold');
    chat.setAttribute('label', `Ask about replacing ${TOOLS[id].name}`);
    chat.setAttribute('placeholder', 'What would your team need to keep?');
    chat.setAttribute('no-expand', '');
    const fallback = node('div', 'offline-fallback'); fallback.slot = 'offline';
    fallback.append(node('p', '', 'Live chat is unavailable right now. Your local comparison still works.'));
    const retry = node('button', '', 'Check again'); retry.addEventListener('click', () => void clients.get(id).retry()); fallback.append(retry); chat.append(fallback);
    chats.set(id, chat);
  }
  updateContext(); $('chat-mount').replaceChildren(chats.get(id)); updateLocks();
}
function render() {
  renderShelf(); $('tool-name').textContent = TOOLS[state.selected].name; renderSample(); renderDependencies(); renderResults(); mountChat(); updateContext();
}
$('reset').addEventListener('click', () => {
  if (Object.keys(TOOLS).some(locked)) return;
  state = defaults(); Object.keys(snapshots).forEach(id => delete snapshots[id]);
  // A reset must not leave old advice beside a newly reset set of assumptions.
  for (const [id, client] of clients) {
    client.setDraft('');
    if (chats.has(id)) { chats.get(id).draft = ''; chats.get(id).quote = ''; }
    if (client.getSnapshot().phase === 'ended') void client.newChat();
  }
  save(); render(); announce('Planner reset. Documents, wiki, and tasks are on your shelf.');
});
async function loadChat() {
  $('chat-mount').replaceChildren(node('p', 'offline-fallback', 'Loading live chat… Your comparison is ready to use.'));
  try {
    const [{ getClient }] = await Promise.all([import('./stand-visitor.js'), import('./stand-inline.js')]);
    for (const id of Object.keys(TOOLS)) {
      const client = getClient({ site: SITE_ID, scope: `dayfolio-${id}` }); clients.set(id, client);
      client.subscribe(s => {
        if (locked(id) && !snapshots[id]) snapshots[id] = normalize({ ...state, selected: id, shelf: [...new Set([...state.shelf, id])] });
        if (!locked(id) && s.phase !== 'loading') delete snapshots[id];
        save(); updateLocks();
      });
    }
    // A reload restores the original assumptions alongside the matching session.
    for (const id of Object.keys(TOOLS)) {
      if (locked(id) && snapshots[id]) state.jobs[id] = structuredClone(snapshots[id].jobs[id]);
    }
    chatReady = true; render();
  } catch {
    const panel = node('div', 'offline-fallback'); panel.append(node('p', '', 'The chat files could not load. Your comparison still works.'));
    const retry = node('button', '', 'Retry loading chat'); retry.addEventListener('click', loadChat); panel.append(retry); $('chat-mount').replaceChildren(panel);
  }
}
render(); void loadChat();
