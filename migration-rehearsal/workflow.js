// Local, deterministic rehearsal rules. No migration or product API is called.
export const SAMPLES = {
  product: { name: 'Product & engineering', columns: ['Backlog', 'In progress', 'In review', 'Approval', 'Done'] },
  delivery: { name: 'Client delivery', columns: ['Intake', 'Planned', 'In progress', 'Client sign-off', 'Delivered'] },
  simple: { name: 'A simple kanban', columns: ['To do', 'Doing', 'Done'] },
};
export const REQUIREMENTS = {
  custom: 'Custom statuses', reporting: 'Reporting', approvals: 'Approvals',
};
export function sample(key = 'product') {
  const scenario = Object.hasOwn(SAMPLES, key) ? key : 'product';
  const preset = SAMPLES[scenario];
  return { scenario, columns: preset.columns.map((name, i) => ({ id: `stage-${i + 1}`, name })), requirements: ['custom', 'approvals'] };
}
const GROUPS = [
  ['Backlog', ['backlog', 'intake', 'inbox', 'triage']],
  ['Ready', ['to do', 'todo', 'planned', 'ready', 'selected']],
  ['In progress', ['in progress', 'doing', 'building', 'development']],
  ['In review', ['in review', 'review', 'qa', 'testing']],
  ['Done', ['done', 'complete', 'completed', 'delivered', 'shipped']],
];
const normalized = (name) => name.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
export function rehearse(board) {
  const keep = board.requirements.includes('custom');
  const counts = new Map();
  board.columns.forEach(({ name }) => counts.set(normalized(name), (counts.get(normalized(name)) || 0) + 1));
  const mappings = board.columns.map((column, i) => {
    const name = normalized(column.name);
    const approval = /\b(approval|approve|approved|sign off|signoff)\b/.test(name);
    const group = GROUPS.find(([, synonyms]) => synonyms.includes(name))?.[0];
    let reason = 'Recognized label; order is preserved in this rehearsal.';
    let question = 'What should stay the same when this work moves to the next stage?';
    let uncertain = false;
    if (!name) { uncertain = true; reason = 'This column needs a name before it can be mapped.'; question = 'What work belongs in this unnamed column?'; }
    else if (approval) { uncertain = true; reason = 'A status can hold the place. Sign-off rules still need an owner.'; question = 'This approval step looks important. Who needs to sign off?'; }
    else if (!group) { uncertain = true; reason = 'Custom label retained; its meaning needs a decision.'; question = `What does “${column.name}” mean, and what lets work leave it?`; }
    else if (group === 'Done' && i !== board.columns.length - 1) { uncertain = true; reason = 'Completed work appears before another stage. Confirm the intended order.'; question = 'Is this truly the end of the workflow, or does another step follow?'; }
    if (name && counts.get(name) > 1) { uncertain = true; reason = 'Repeated column name. Clarify whether these are separate steps.'; question = 'How do these identically named steps differ?'; }
    return { ...column, target: (keep || approval || !group) ? column.name.trim() || 'Unnamed status' : group,
      group: approval ? 'Approval gate' : group || 'Custom status', uncertain, reason, question, approval };
  });
  const decisions = mappings.filter(m => m.uncertain).map(m => ({ id: m.id, title: m.name.trim() || 'Unnamed column', detail: m.reason }));
  if (board.requirements.includes('reporting')) decisions.push({ id: 'reporting', title: 'Reporting parity', detail: 'Agree on metrics, date fields, and historical data before comparing reports.' });
  if (board.requirements.includes('approvals') && !mappings.some(m => m.approval)) decisions.push({ id: 'approvals', title: 'An approval checkpoint', detail: 'Choose where sign-off belongs and who may approve. No gate was added automatically.' });
  return { mappings, decisions, clear: mappings.filter(m => !m.uncertain).length };
}
export function moveColumn(columns, id, destination) {
  const index = columns.findIndex(c => c.id === id);
  if (index < 0 || destination < 0 || destination >= columns.length || index === destination) return columns;
  const next = [...columns];
  next.splice(destination, 0, next.splice(index, 1)[0]);
  return next;
}
export function restoreBoard(value) {
  if (!value || !Array.isArray(value.columns) || value.columns.length < 2 || value.columns.length > 8) return sample();
  const ids = new Set();
  const columns = value.columns.map((column, i) => {
    let id = typeof column?.id === 'string' && /^[a-zA-Z0-9-]{1,50}$/.test(column.id) && !ids.has(column.id) ? column.id : `restored-${i}`;
    while (ids.has(id)) id += '-r';
    ids.add(id);
    return { id, name: typeof column?.name === 'string' ? column.name.slice(0, 40) : '' };
  });
  return { scenario: Object.hasOwn(SAMPLES, value.scenario) ? value.scenario : 'product', columns,
    requirements: Object.keys(REQUIREMENTS).filter(k => Array.isArray(value.requirements) && value.requirements.includes(k)) };
}
export function contextFor(board, selected) {
  const result = rehearse(board);
  const mapping = result.mappings.find(m => m.id === selected);
  const decision = result.decisions.find(m => m.id === selected);
  return [
    'Threadlane migration rehearsal — fictional product; illustrative local mapping, not a completed import.',
    `Starting workflow: ${SAMPLES[board.scenario].name}.`,
    `Current columns, in order: ${board.columns.map(c => c.name.trim() || '(unnamed)').join(' → ')}.`,
    `Proposed columns: ${result.mappings.map(m => m.target).join(' → ')}.`,
    `Non-negotiables: ${board.requirements.map(k => REQUIREMENTS[k]).join(', ') || 'None selected'}.`,
    `Selected: ${mapping ? `${mapping.name || '(unnamed)'} → ${mapping.target}. ${mapping.reason}` : decision ? `${decision.title}. ${decision.detail}` : 'Overall workflow'}`,
    'Assumptions: labels and order only; no tickets, permissions, automation, history, or metrics were inspected. Unknown labels and sign-offs need human decisions. This chat cannot change the board or perform a migration.',
  ].join('\n');
}
