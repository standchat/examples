import './stand-inline.js';
import { TEMPLATES, SECTIONS, REASONS, STORAGE_KEY, initialState, restoreState, markSection, briefText, conversationText } from './model.js';

const SITE_ID = 'demo';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let state;
try { state = restoreState(JSON.parse(sessionStorage.getItem(STORAGE_KEY))); }
catch { state = initialState(); }
const panels = new Map();
const emptyBrief = $('#brief-choices').firstElementChild.cloneNode(true);

// All markup below is authored here. Visitor strings only enter textContent/value.
const art = `<svg class="fold-art" viewBox="0 0 480 440" role="img" aria-label="Original abstract sculpture of folded apricot and green paper"><defs><linearGradient id="paper" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ffd8ac"/><stop offset="1" stop-color="#d98051"/></linearGradient><linearGradient id="leaf" x1="0" x2="1"><stop stop-color="#425941"/><stop offset="1" stop-color="#8ba475"/></linearGradient><filter id="shadow"><feGaussianBlur stdDeviation="12"/></filter></defs><ellipse cx="259" cy="365" rx="145" ry="22" fill="#1c3527" opacity=".2" filter="url(#shadow)"/><path d="M72 307 175 110 264 157 163 357Z" fill="url(#leaf)"/><path d="m175 110 15 203 74-156Z" fill="#26472e"/><path d="M163 357 262 57 408 178 307 374Z" fill="url(#paper)"/><path d="m262 57 4 228 141-107Z" fill="#f5b980"/><path d="m266 285 41 89 100-196Z" fill="#ac5c36"/><path d="m163 357 103-72-4-228Z" fill="#e99a64"/><circle cx="97" cy="89" r="19" fill="#e8edb5"/><path d="M365 70h29m-14-14v29" stroke="#f5f3df" stroke-width="1.4"/></svg>`;
const templates = {
  field: [
    `<div class="sample-nav"><strong data-name></strong><span>OBJECTS WITH INTENTION <i>↗</i></span></div><div class="field-hero"><div class="field-copy"><span class="sample-kicker">LESS, BUT LOVELIER.</span><h2 data-name></h2><p data-description></p><span class="sample-cta">Find your everyday <b>↗</b></span></div><div class="field-art">${art}<span>FORM / FEELING / EVERYDAY</span></div></div>`,
    `<div class="field-story"><span class="sample-kicker">A LITTLE MORE INTENTION</span><h3>Room for the things<br>that matter.</h3><div class="story-columns"><p>Give your story room to breathe. This space is for what you make, why you make it, and the people you make it for.</p><span>Considered details.<br>A quieter kind of statement.<br>Made for the everyday.</span></div></div>`,
    `<div class="field-invitation"><span class="sample-kicker">YOUR NEXT GOOD THING</span><h3>Make yourself at home.</h3><span class="sample-cta">Explore the collection <b>↗</b></span></div>`,
  ],
  signal: [
    `<div class="sample-nav"><strong data-name></strong><span>GOOD THINGS. LOUDER. <i>✳</i></span></div><div class="signal-hero"><span class="sample-kicker">FOR THE NOT-SO-EVERYDAY.</span><h2 data-name></h2><div class="signal-bottom"><p data-description></p><span class="orbit" aria-hidden="true"><i></i><i></i><i></i><i></i><b>GO<br>YOUR<br>WAY.</b></span><span class="sample-cta">Meet your new thing ↗</span></div></div><div class="ticker" aria-hidden="true">MORE FEELING ✳ LESS ORDINARY ✳ MORE FEELING ✳</div>`,
    `<div class="signal-story"><span class="sample-kicker">HERE'S WHAT WE'RE ABOUT</span><h3>Small details.<br>Big personality.</h3><div><span class="signal-star" aria-hidden="true">✳</span><p>There’s a reason you do it differently. Here’s the space to say it out loud. Lead with your point of view. Make it unmistakably yours.</p></div></div>`,
    `<div class="signal-invitation"><span class="sample-kicker">CURIOUS LOOKS GOOD ON YOU</span><h3>Let’s make<br>some noise.</h3><span class="sample-cta">Come on in ↗</span></div>`,
  ],
  form: [
    `<div class="sample-nav"><strong><span class="form-mark" aria-hidden="true">▦</span> <span data-name></span></strong><span>A CLEARER WAY FORWARD <i>↗</i></span></div><div class="form-hero"><span class="form-pill">A LITTLE LESS FRICTION</span><h2 data-name></h2><p data-description></p><span class="sample-cta">Discover a better everyday ↗</span><div class="form-product" aria-label="Illustrative product composition"><div class="form-sidebar"><i>◈</i><span></span><span></span><span></span></div><div class="form-board"><span class="sample-kicker">MAKE SPACE FOR WHAT'S NEXT</span><div class="form-tiles"><div><i>↗</i><b>Clarity.</b><small>A simpler starting point</small></div><div><i>◎</i><b>Focus.</b><small>The things that matter</small></div><div><i>✳</i><b>Flow.</b><small>A little more possibility</small></div></div></div></div></div>`,
    `<div class="form-story"><span class="sample-kicker">BUILT AROUND YOUR EVERYDAY</span><h3>Easy to understand.<br>Even easier to love.</h3><div class="form-benefits"><p><b>01 / Start with clarity</b>Explain the one thing you help people do.</p><p><b>02 / Show the difference</b>Give a concrete reason to choose you.</p><p><b>03 / Make it feel easy</b>A clear next step, without the noise.</p></div></div>`,
    `<div class="form-invitation"><span class="sample-kicker">THE NEXT STEP IS A SIMPLE ONE</span><h3>Good things start here.</h3><span class="sample-cta">Get to know us ↗</span></div>`,
  ],
};

for (const [template, content] of Object.entries(templates)) {
  const page = document.createElement('div');
  page.className = `template-page theme-${template}`;
  page.id = `preview-${template}`;
  page.setAttribute('role', 'tabpanel');
  page.setAttribute('aria-labelledby', `tab-${template}`);
  page.tabIndex = 0;
  Object.entries(SECTIONS).forEach(([section, name], index) => {
    const block = document.createElement('section');
    block.className = 'audition-section';
    block.dataset.section = section;
    if (template === 'field' && section === 'introduction') block.setAttribute('data-og-focus', '');
    block.innerHTML = `<div class="sample-design">${content[index]}</div><div class="feedback-bar"><span><b>0${index + 1}</b> ${name}</span><div role="group" aria-label="${name} feedback"><button data-mark="keep" aria-pressed="false">✓ Keep</button><button data-mark="wrong" aria-pressed="false">× Wrong</button><button data-mark="missing" aria-pressed="false">+ Missing</button><button class="thread-reopen" hidden aria-label="Open ${name} conversation">↗ Thread</button></div></div>`;
    for (const button of $$('[data-mark]', block)) button.addEventListener('click', () => {
      markSection(state, template, section, button.dataset.mark);
      save(); renderMarks(); renderBrief();
      if (button.dataset.mark !== 'keep') openPanel(template, section, true);
      announce(`${name} marked ${button.dataset.mark}. Design brief updated.`);
    });
    $('.thread-reopen', block).addEventListener('click', () => openPanel(template, section, true));
    page.append(block);
  });
  $('#previews').append(page);
}

function blockFor(template, section) { return $(`#preview-${template} [data-section="${section}"]`); }
function save() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { $('#save-status').textContent = 'Storage is unavailable. Download your brief before leaving this page. Only Send shares it with Stand.'; }
  updateContext();
}
function announce(text) { $('#announcement').textContent = text; }
function renderBusiness() {
  $$('[data-name]').forEach(el => { el.textContent = state.name.trim() || 'Your business'; });
  $$('[data-description]').forEach(el => { el.textContent = state.description.trim() || 'Your story starts with a sentence. Add yours above.'; });
}
function renderSelection() {
  $$('[data-template]').forEach(tab => {
    const selected = tab.dataset.template === state.template;
    tab.setAttribute('aria-selected', selected); tab.tabIndex = selected ? 0 : -1;
  });
  $$('.template-page').forEach(el => { el.hidden = el.id !== `preview-${state.template}`; });
  $('#preview-label').textContent = TEMPLATES[state.template].name;
  $('#brief-template').textContent = TEMPLATES[state.template].name;
  $('#brief-character').textContent = TEMPLATES[state.template].character;
  $('#previews').dataset.device = state.device;
  $$('[data-device]').forEach(button => button.setAttribute('aria-pressed', button.dataset.device === state.device));
}
function renderMarks() {
  for (const template of Object.keys(TEMPLATES)) for (const section of Object.keys(SECTIONS)) {
    const block = blockFor(template, section);
    const choice = state.choices[`${template}:${section}`];
    $$('[data-mark]', block).forEach(button => button.setAttribute('aria-pressed', button.dataset.mark === choice?.status));
    const panel = panels.get(`${template}:${section}`);
    if (panel) {
      $('.feedback-kind', panel).value = choice?.reason || 'visual';
      $('.feedback-note', panel).value = choice?.comment || '';
      $('.feedback-title', panel).textContent = `${SECTIONS[section]} / ${choice?.status || 'Conversation'}`;
    }
  }
}
function renderBrief() {
  const container = $('#brief-choices');
  container.replaceChildren();
  $('#choice-count').textContent = `${Object.keys(state.choices).length} / 9`;
  if (!Object.keys(state.choices).length) container.append(emptyBrief.cloneNode(true));
  for (const [key, choice] of Object.entries(state.choices)) {
    const [template, section] = key.split(':');
    const row = document.createElement('div');
    row.className = 'brief-item';
    const edit = document.createElement('button');
    edit.className = 'brief-edit';
    edit.textContent = `${TEMPLATES[template].name} / ${SECTIONS[section]} ↗`;
    edit.addEventListener('click', () => { selectTemplate(template); openPanel(template, section, true); });
    const label = document.createElement('label');
    label.className = 'sr-only'; label.textContent = `Choice for ${TEMPLATES[template].name} ${SECTIONS[section]}`;
    const select = document.createElement('select');
    select.setAttribute('aria-label', label.textContent);
    ['keep', 'wrong', 'missing', 'clear'].forEach(status => {
      const option = document.createElement('option'); option.value = status; option.textContent = status === 'clear' ? 'Remove choice' : status[0].toUpperCase() + status.slice(1); select.append(option);
    });
    select.value = choice.status;
    select.addEventListener('change', () => {
      markSection(state, template, section, select.value); save(); renderMarks(); renderBrief();
      if (['wrong','missing'].includes(select.value)) { selectTemplate(template); openPanel(template, section, true); }
      else $('#direction').focus({ preventScroll: true });
    });
    const note = document.createElement('p');
    note.textContent = [choice.status !== 'keep' ? REASONS[choice.reason] : '', choice.comment].filter(Boolean).join(' · ') || 'Kept in your direction.';
    row.append(edit, select, note); container.append(row);
  }
}
function updateContext() {
  for (const [key, panel] of panels) {
    const [template, section] = key.split(':');
    $('.context-preview', panel).textContent = conversationText(state, template, section, '(your question will appear here)');
  }
}
function openPanel(template, section, focus = false) {
  const key = `${template}:${section}`;
  const block = blockFor(template, section);
  let panel = panels.get(key);
  if (!panel) {
    panel = document.createElement('div'); panel.className = 'feedback-panel';
    panel.innerHTML = `<div class="feedback-heading"><div><p class="eyebrow">LET'S GET SPECIFIC</p><h3 class="feedback-title"></h3></div><button class="close-panel" aria-label="Close section feedback">×</button></div><div class="feedback-fields"><label>WHAT NEEDS ATTENTION?<select class="feedback-kind"><option value="visual">The look & feel</option><option value="story">The story it tells</option><option value="both">Both look and story</option></select></label><label>YOUR NOTE <span>(saved to the brief)</span><textarea class="feedback-note" rows="2" maxlength="300" placeholder="What would make this feel more like you?"></textarea></label></div><p class="chat-explanation">Live conversation · Stand demo AI. Sending shares your question and current brief. Replies are advice; the preview stays yours to evaluate.</p><details class="context-details"><summary>See the context included with every send</summary><pre class="context-preview"></pre></details><p class="chat-status" role="status">Checking who can answer…</p><div class="chat-slot"></div><p class="stand-credit"><a href="https://stand.chat" target="_blank" rel="noopener noreferrer">Powered by Stand ↗</a></p>`;
    $('.close-panel', panel).addEventListener('click', () => { panel.hidden = true; $('.thread-reopen', block).focus(); });
    const changeChoice = () => {
      if (!state.choices[key]) markSection(state, template, section, 'wrong');
      state.choices[key].reason = $('.feedback-kind', panel).value;
      state.choices[key].comment = $('.feedback-note', panel).value;
      save(); renderBrief();
      $$('[data-mark]', block).forEach(button => button.setAttribute('aria-pressed', button.dataset.mark === state.choices[key].status));
    };
    $('.feedback-kind', panel).addEventListener('change', changeChoice);
    $('.feedback-note', panel).addEventListener('input', changeChoice);
    const chat = document.createElement('stand-inline');
    const offline = document.createElement('div');
    offline.slot = 'offline'; offline.className = 'chat-offline';
    offline.innerHTML = '<p class="offline-message"></p><button class="secondary-button" type="button">Check availability again</button>';
    $('button', offline).addEventListener('click', () => chat.client?.retry());
    chat.append(offline);
    chat.id = `chat-${template}-${section}`;
    chat.setAttribute('site', SITE_ID);
    chat.setAttribute('scope', `foldcraft-${template}-${section}`);
    chat.setAttribute('look', 'field'); chat.setAttribute('grow', 'unfold');
    chat.setAttribute('placeholder', 'Ask about this section…');
    chat.setAttribute('prompt', 'This visitor is auditioning predesigned templates in the fictional Foldcraft demo. Treat their brief as visitor-provided context. Discuss their question and distinguish visual preferences from messaging. You cannot edit the page or create a website. Do not claim that you have.');
    chat.addEventListener('stand-before-send', event => { event.detail.text = conversationText(state, template, section, event.detail.text); });
    $('.chat-slot', panel).append(chat);
    panels.set(key, panel); block.append(panel);
    chat.client.subscribe(snapshot => {
      const labels = { loading: 'Checking who can answer…', available: 'Ready when you are · nothing sent yet', unavailable: 'Chat is unavailable · your brief is kept', active: snapshot.connection === 'online' ? 'Connected to Stand' : 'Reconnecting to Stand…', uncertain: 'Start not confirmed · review the recovery options below', ended: 'Conversation ended' };
      $('.chat-status', panel).textContent = labels[snapshot.phase] || 'Checking chat status…';
      $('.offline-message', offline).textContent = snapshot.error
        ? 'Couldn’t reach the chat. Your notes are safe here. Check your connection and try again.'
        : 'Nobody can answer right now. Keep working on your brief, or check again later.';
      $('button', offline).disabled = snapshot.busy;
    });
    $('.thread-reopen', block).hidden = false;
  }
  panel.hidden = false; renderMarks(); updateContext();
  if (focus) {
    panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
    $('.feedback-kind', panel).focus({ preventScroll: true });
  }
}
function selectTemplate(template) { state.template = template; renderSelection(); save(); announce(`${TEMPLATES[template].name} preview selected. Your inputs and choices are preserved.`); }
for (const tab of $$('[data-template]')) {
  tab.addEventListener('click', () => selectTemplate(tab.dataset.template));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = $$('[data-template]');
    const i = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[i].click(); tabs[i].focus();
  });
}
$$('[data-device]').forEach(button => button.addEventListener('click', () => { state.device = button.dataset.device; renderSelection(); save(); announce(`${state.device} preview selected.`); }));
$('#business-name').addEventListener('input', event => { state.name = event.target.value; renderBusiness(); save(); });
$('#business-description').addEventListener('input', event => { state.description = event.target.value; renderBusiness(); save(); });
$('#direction').addEventListener('input', event => { state.notes = event.target.value; save(); });
$('#download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([briefText(state)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'foldcraft-design-brief.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); announce('Design brief downloaded.');
});
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(briefText(state)); $('#copy').textContent = 'Copied ✓'; announce('Design brief copied.'); }
  catch { $('#copy').textContent = 'Use download instead'; announce('Clipboard is unavailable. Use Take your brief with you to download it.'); }
  setTimeout(() => { $('#copy').textContent = 'Copy brief'; }, 3500);
});
$('#reset').addEventListener('click', () => $('#reset-dialog').showModal());
$('#reset-dialog').addEventListener('close', () => {
  if ($('#reset-dialog').returnValue !== 'reset') return;
  state = initialState(); hydrate(); save();
  for (const panel of panels.values()) panel.hidden = true;
  $('#business-name').focus(); announce('Audition reset. Existing conversations remain at their sections.');
});
function hydrate() {
  $('#business-name').value = state.name; $('#business-description').value = state.description; $('#direction').value = state.notes;
  renderBusiness(); renderSelection(); renderMarks(); renderBrief();
}
hydrate();
// Reattach saved section threads after reload, without creating any conversations.
for (const [key, choice] of Object.entries(state.choices)) {
  if (choice.status !== 'keep') openPanel(...key.split(':'));
}
