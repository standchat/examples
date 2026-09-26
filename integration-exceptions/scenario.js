export const TOOLS = {
  forms: { name: 'Forms', icon: 'forms', triggers: ['New submission', 'Submission updated'], actions: [] },
  crm: { name: 'CRM', icon: 'crm', triggers: ['Contact added', 'Contact updated'], actions: ['Create contact', 'Update contact'] },
  chat: { name: 'Team chat', icon: 'chat', triggers: [], actions: ['Post a message', 'Send a direct message'] },
  payments: { name: 'Payments', icon: 'payments', triggers: ['Payment received', 'Subscription updated'], actions: [] },
  sheets: { name: 'Spreadsheets', icon: 'sheets', triggers: ['Row added', 'Row updated'], actions: ['Add a row', 'Update a row'] },
};

export const RECORDS = {
  paid: { name: 'Mika Chen', company: 'Fieldwork Studio', email: 'mika@fieldwork.example', plan: 'paid', amount: 240, existing: false },
  trial: { name: 'Jules Reed', company: 'Daybreak Goods', email: 'jules@daybreak.example', plan: 'trial', amount: 0, existing: false },
  duplicate: { name: 'Noor Ellis', company: 'Softcorner', email: ' NOOR@SOFTCORNER.EXAMPLE ', plan: 'paid', amount: 120, existing: true },
  large: { name: 'Ari Lane', company: 'Northline Works', email: 'ari@northline.example', plan: 'paid', amount: 1200, existing: false },
};

export const RULES = { none: 'No exception yet', paid: 'Paid customers only', dedupe: 'Skip existing records', amount: 'Minimum order amount' };
export const DEFAULT = Object.freeze({ source: 'forms', trigger: 'New submission', target: 'crm', action: 'Create contact', rule: 'none', threshold: 200, branch: 'stop', sample: 'paid', requirement: '' });
const EXISTING_EMAILS = ['noor@softcorner.example'];

// The simulator uses a fixed fixture, not a real service lookup or AI decision.
export function simulate(config) {
  const c = normalize(config);
  const record = RECORDS[c.sample];
  let passes = true;
  let reason = 'No filter is set. Every sample reaches the action.';
  if (c.rule === 'paid') {
    passes = record.plan === 'paid';
    reason = passes ? 'Plan is paid. The record meets this rule.' : 'Plan is trial. This rule only accepts paid customers.';
  } else if (c.rule === 'dedupe') {
    passes = !EXISTING_EMAILS.includes(record.email.trim().toLowerCase());
    reason = passes ? 'No matching email in the fixed example directory.' : 'A matching email exists after trimming spaces and ignoring case.';
  } else if (c.rule === 'amount') {
    passes = record.amount >= c.threshold;
    reason = `$${record.amount.toLocaleString('en-US')} ${passes ? 'meets' : 'is below'} the $${c.threshold.toLocaleString('en-US')} minimum (USD).`;
  }
  const route = passes ? 'action' : c.branch === 'review' ? 'review' : 'stop';
  return { passes, route, reason, title: route === 'action' ? `${c.action} · simulated` : route === 'review' ? 'Sent to review · simulated' : 'Record blocked · simulated', record };
}

export function normalize(value = {}) {
  const c = { ...DEFAULT, ...value };
  if (!TOOLS[c.source]?.triggers?.length) c.source = DEFAULT.source;
  if (!TOOLS[c.source].triggers.includes(c.trigger)) c.trigger = TOOLS[c.source].triggers[0];
  if (!TOOLS[c.target]?.actions?.length) c.target = DEFAULT.target;
  if (!TOOLS[c.target].actions.includes(c.action)) c.action = TOOLS[c.target].actions[0];
  if (!Object.hasOwn(RULES, c.rule)) c.rule = DEFAULT.rule;
  if (!Object.hasOwn(RECORDS, c.sample)) c.sample = DEFAULT.sample;
  c.branch = c.branch === 'review' ? 'review' : 'stop';
  c.threshold = Number.isFinite(Number(c.threshold)) ? Math.min(10000, Math.max(0, Math.round(Number(c.threshold)))) : DEFAULT.threshold;
  c.requirement = typeof c.requirement === 'string' ? c.requirement.slice(0, 400) : '';
  return Object.fromEntries(Object.keys(DEFAULT).map(key => [key, c[key]]));
}
