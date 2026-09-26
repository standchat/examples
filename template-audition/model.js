export const TEMPLATES = {
  field: { name: 'Fieldwork', character: 'Editorial · organic · unhurried' },
  signal: { name: 'Signal', character: 'Expressive · bold · energetic' },
  form: { name: 'Good Form', character: 'Precise · calm · product-led' },
};
export const SECTIONS = { introduction: 'Introduction', story: 'The story', invitation: 'The invitation' };
export const REASONS = { visual: 'The look & feel', story: 'The story it tells', both: 'Both look and story' };
export const ASSUMPTIONS = 'These are local, predesigned layouts, not AI-generated websites. Only the business name and description replace preview text. Abstract artwork, supporting copy, and calls to action are illustrative placeholders. Feedback does not change the designs. Chat advice never edits the page.';
export const STORAGE_KEY = 'foldcraft-audition-v1';

export function initialState() {
  return { name: 'Sunday Supply', description: 'Everyday objects for a slower, more considered life.', template: 'field', device: 'desktop', notes: '', choices: {} };
}
const clean = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const validKey = (key) => Object.keys(TEMPLATES).some(t => Object.keys(SECTIONS).some(s => key === `${t}:${s}`));

// Storage is untrusted. Restore only bounded, recognized fields and section IDs.
export function restoreState(saved) {
  const state = initialState();
  if (!saved || typeof saved !== 'object') return state;
  state.name = typeof saved.name === 'string' ? clean(saved.name, 60) : state.name;
  state.description = typeof saved.description === 'string' ? clean(saved.description, 240) : state.description;
  state.template = Object.hasOwn(TEMPLATES, saved.template) ? saved.template : state.template;
  state.device = saved.device === 'mobile' ? 'mobile' : 'desktop';
  state.notes = clean(saved.notes, 500);
  for (const [key, choice] of Object.entries(saved.choices || {})) {
    if (!validKey(key) || !choice || !['keep', 'wrong', 'missing'].includes(choice.status)) continue;
    state.choices[key] = { status: choice.status, reason: Object.hasOwn(REASONS, choice.reason) ? choice.reason : 'visual', comment: clean(choice.comment, 300) };
  }
  return state;
}

export function markSection(state, template, section, status) {
  const key = `${template}:${section}`;
  if (!validKey(key) || !['keep', 'wrong', 'missing', 'clear'].includes(status)) throw new Error('Unknown section choice');
  if (status === 'clear') delete state.choices[key];
  else state.choices[key] = { reason: 'visual', comment: '', ...state.choices[key], status };
}

export function briefText(state) {
  const lines = [
    'FOLDCRAFT / DESIGN BRIEF',
    `Business: ${state.name.trim() || '(name not entered)'}`,
    `Description: ${state.description.trim() || '(description not entered)'}`,
    `Currently auditioning: ${TEMPLATES[state.template].name} (${state.device} view)`,
    '', 'Explicit section choices:',
  ];
  for (const template of Object.keys(TEMPLATES)) for (const section of Object.keys(SECTIONS)) {
    const choice = state.choices[`${template}:${section}`];
    if (!choice) continue;
    lines.push(`- ${TEMPLATES[template].name} / ${SECTIONS[section]}: ${choice.status.toUpperCase()}${choice.status === 'keep' ? '' : ` — ${REASONS[choice.reason]}`}${choice.comment ? `; ${choice.comment}` : ''}`);
  }
  if (!Object.keys(state.choices).length) lines.push('No sections marked yet.');
  lines.push('', `My direction: ${state.notes.trim() || '(not entered)'}`, '', `Assumptions: ${ASSUMPTIONS}`);
  return lines.join('\n');
}

export function conversationText(state, template, section, question) {
  if (!Object.hasOwn(TEMPLATES, template) || !Object.hasOwn(SECTIONS, section)) throw new Error('Unknown conversation context');
  // An uncertain start restores the complete sent body. Recognize this section's
  // own intact envelope so an explicit retry refreshes context instead of nesting it.
  const heading = `\n\nAbout: ${TEMPLATES[template].name} / ${SECTIONS[section]}\nTemplate personality: ${TEMPLATES[template].character}\n\n`;
  let text = question.trim();
  const boundary = text.indexOf(`${heading}FOLDCRAFT / DESIGN BRIEF\n`);
  if (text.startsWith('My question: ') && boundary >= 0 && text.endsWith(`Assumptions: ${ASSUMPTIONS}`)) {
    text = text.slice('My question: '.length, boundary);
  }
  // A fresh context snapshot is visitor-authored data in a supported text message.
  return `My question: ${text}${heading}${briefText(state)}`;
}
