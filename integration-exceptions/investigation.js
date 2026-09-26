import { normalize, simulate, TOOLS, RULES } from './scenario.js';

export const FIELDS = Object.freeze(['plan', 'email', 'amount']);
export const START = Object.freeze({ ...normalize(), rule: 'paid', sample: 'trial' });

// Runs are immutable local evidence. Neither a later edit nor a reply rewrites one.
export function makeRun(config, id = 1) {
  const c = Object.freeze(normalize(config));
  const outcome = simulate(c);
  return Object.freeze({
    id: Number.isSafeInteger(id) && id > 0 ? id : 1,
    config: c,
    result: Object.freeze({ ...outcome, record: Object.freeze({ ...outcome.record }) }),
  });
}

export function restoreRun(value) {
  return value && typeof value === 'object' && value.config ? makeRun(value.config, value.id) : null;
}

export const runLabel = run => `Run ${String(run.id).padStart(3, '0')}`;
export const sameRun = (a, b) => Boolean(a && b && a.id === b.id && JSON.stringify(a.config) === JSON.stringify(b.config));
export const fieldValue = (run, field) => field === 'amount' ? `${run.result.record.amount} USD` : String(run.result.record[field]);

export function compareRuns(before, after) {
  const labels = { source: 'Source', trigger: 'Trigger', target: 'Destination', action: 'Action', rule: 'Rule', threshold: 'Threshold', branch: 'Failure path', sample: 'Sample', requirement: 'Requirement' };
  const display = (key, value) => ['source', 'target'].includes(key) ? TOOLS[value].name : key === 'rule' ? RULES[value] : key === 'sample' ? value : String(value);
  const changes = Object.keys(labels).filter(key => before.config[key] !== after.config[key]).map(key => ({
    field: key, label: labels[key], before: display(key, before.config[key]), after: display(key, after.config[key]),
  }));
  return { changes, before: before.result.route, after: after.result.route, changedRoute: before.result.route !== after.result.route };
}

function runText(run) {
  const c = run.config, r = run.result.record;
  return `${runLabel(run)}: ${TOOLS[c.source].name}/${c.trigger} → step 02 ${RULES[c.rule]}${c.rule === 'amount' ? ` (>=${c.threshold} USD)` : ''} → ${TOOLS[c.target].name}/${c.action}. Failed rule: ${c.branch}. Record: ${r.name}, ${r.company}, email=${r.email}, plan=${r.plan}, amount=${r.amount} USD, exists=${r.existing}. Result=${run.result.route}. ${run.result.reason}`;
}

export function investigationContext({ anchor, comparison = null, fields = [] }) {
  const selected = FIELDS.filter(field => fields.includes(field));
  return [
    'Flowspoke fictional workflow investigation. Stand conversation branches from exception step 02. Runs below are local simulations, not service executions.',
    `ANCHOR ${runText(anchor)}`,
    selected.length ? `Visitor highlighted fields on anchor: ${selected.map(field => `${field}=${fieldValue(anchor, field)}`).join('; ')}.` : '',
    comparison ? `COMPARISON ${runText(comparison)}` : '',
    `Requirement to discuss: ${(comparison || anchor).config.requirement || 'Determine what a real integration needs to handle this exception.'}`,
    'Assumptions: fixed fixtures; paid means plan=paid; dedupe trims and lowercases email against noor@softcorner.example; USD threshold is inclusive. No writes, connections, or changing directory. Review skips main action. Replies cannot edit the flow. Discuss missing fields and connector limitations; never claim execution.',
  ].filter(Boolean).join('\n');
}

// The evidence travels in visitor text for both the initial question and follow-ups.
// This prefix is generated locally, never inferred from an AI message.
export function evidenceMessage(evidence, question) {
  return `[Flowspoke investigation]\n${JSON.stringify({ evidence: investigationContext(evidence), question: String(question).trim() })}`;
}

export function readEvidence(body) {
  if (!body.startsWith('[Flowspoke investigation]\n')) return null;
  try {
    const value = JSON.parse(body.slice('[Flowspoke investigation]\n'.length));
    return typeof value?.evidence === 'string' && typeof value?.question === 'string' ? value : null;
  } catch { return null; }
}
