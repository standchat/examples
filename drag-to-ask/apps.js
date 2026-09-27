// What happens inside the windows: tabs, the chart, the replay, the price sheet's
// estimate, feature flag switches and the trash. Rows that change keep their
// data-val up to date, so a drag always carries what the row shows right now.

import { initChart } from './chart.js';
import { initReplay } from './replay.js';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US');

export function initApps(root, desktop, { onChange = () => {}, onEmptyTrash = () => {} } = {}) {
  const { load, store } = desktop.storage;
  const saved = load().apps ?? {};
  const persist = (patch) => store({ ...load(), apps: { ...(load().apps ?? {}), ...patch } });

  // Tabs ------------------------------------------------------------------------------
  for (const list of root.querySelectorAll('[role="tablist"]')) {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus = false) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      }
      if (focus) tab.focus();
      persist({ tab: tab.id });
    };
    list.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) select(tab);
    });
    list.addEventListener('keydown', (e) => {
      const at = tabs.indexOf(document.activeElement);
      const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
    const remembered = tabs.find((t) => t.id === saved.tab);
    if (remembered) select(remembered);
  }

  // Product analytics and Session replay ------------------------------------------------
  initChart(root.querySelector('[data-chart]'));
  initReplay(root.querySelector('#win-replay'), { isVisible: () => desktop.isVisible('replay') });

  // Pricing.sheet: a small spreadsheet with a live estimate ---------------------------------
  const sheet = root.querySelector('#win-pricing');
  const rows = [...sheet.querySelectorAll('tbody tr[data-price]')];
  const totalRow = sheet.querySelector('.sheet-total');
  const ref = sheet.querySelector('.sheet-ref');
  const expr = sheet.querySelector('.sheet-expr');
  const usage = saved.usage ?? {};
  for (const row of rows) {
    const inputEl = row.querySelector('input');
    if (usage[row.dataset.ask] !== undefined) inputEl.value = int.format(usage[row.dataset.ask]);
    inputEl.addEventListener('input', () => recalc());
    inputEl.addEventListener('change', () => {
      inputEl.value = int.format(parseAmount(inputEl.value));
      recalc();
    });
    inputEl.addEventListener('focus', () => selectCell(inputEl.closest('td')));
  }

  function recalc() {
    let total = 0;
    const saving = {};
    for (const row of rows) {
      const free = Number(row.dataset.free);
      const price = Number(row.dataset.price);
      const unit = row.dataset.unit;
      const used = parseAmount(row.querySelector('input').value);
      const bill = Math.max(0, used - free) * price;
      total += bill;
      saving[row.dataset.ask] = used;
      row.querySelector('.bill').textContent = money.format(bill);
      row.dataset.used = String(used);
      // The price as the sheet writes it ("0.10", not "0.1").
      row.dataset.val = `${int.format(free)} ${unit}s free/mo, then $${row.dataset.price} each${used ? ` · your usage ${int.format(used)} → ${money.format(bill)}/mo` : ''}`;
    }
    totalRow.querySelector('.total').textContent = money.format(total);
    const parts = estimateParts();
    totalRow.dataset.val = `${money.format(total)}/mo${parts.length ? ` for ${parts.join(', ')}` : ''}`;
    persist({ usage: saving });
    onChange();
  }

  function estimateParts() {
    return rows
      .filter((row) => Number(row.dataset.used) > 0)
      .map((row) => `${compact(Number(row.dataset.used))} ${row.dataset.unit === 'request' ? 'flag request' : row.dataset.unit}s`);
  }

  // The formula bar shows what the selected cell holds.
  const letters = ['A', 'B', 'C', 'D', 'E'];
  function selectCell(cell) {
    for (const c of sheet.querySelectorAll('.is-cell')) c.classList.remove('is-cell');
    for (const r of sheet.querySelectorAll('tr.is-selected')) r.classList.remove('is-selected');
    const row = cell.closest('tr');
    const n = row.querySelector('.rn')?.textContent;
    if (cell.classList.contains('rn')) {
      row.classList.add('is-selected');
      ref.textContent = `${n}:${n}`;
      expr.textContent = row.querySelector('th')?.textContent ?? '';
      return;
    }
    cell.classList.add('is-cell');
    const col = letters[[...row.cells].indexOf(cell) - 1] ?? 'A';
    ref.textContent = `${col}${n}`;
    if (row === totalRow && col === 'E') expr.textContent = '=SUM(E2:E8)';
    else if (cell.classList.contains('bill') && row.dataset.price) expr.textContent = `=MAX(0, D${n}-B${n}) * C${n}`;
    else if (cell.querySelector('input')) expr.textContent = String(parseAmount(cell.querySelector('input').value));
    else expr.textContent = cell.textContent.trim();
  }
  sheet.querySelector('tbody').addEventListener('click', (e) => {
    const cell = e.target.closest('td, th');
    if (cell && !cell.querySelector('input')) selectCell(cell);
  });
  sheet.querySelector('tbody').addEventListener('focusin', (e) => {
    if (e.target.matches('tr[data-ask]')) selectCell(e.target.querySelector('.rn'));
  });
  desktop.on((event) => {
    if (event.type === 'reveal' && event.id === 'pricing' && event.el.matches('tr')) selectCell(event.el.querySelector('.rn'));
  });
  recalc();

  // Feature flags: pretend switches that the rows remember ------------------------------------
  const flags = saved.flags ?? {};
  for (const row of root.querySelectorAll('#win-flags tbody tr')) {
    const toggle = row.querySelector('.toggle');
    const describe = () => {
      const on = toggle.getAttribute('aria-checked') === 'true';
      row.dataset.flagOn = String(on);
      const rollout = row.dataset.rollout === '50' && row.dataset.ask.includes('test') ? '50/50 split' : `${row.dataset.rollout}% rollout`;
      row.dataset.val = `${on ? 'on' : 'off'}, ${rollout}, ${row.dataset.note}`;
    };
    if (flags[row.dataset.ask] !== undefined) toggle.setAttribute('aria-checked', String(flags[row.dataset.ask]));
    describe();
    toggle.addEventListener('click', () => {
      const on = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(on));
      describe();
      flags[row.dataset.ask] = on;
      persist({ flags });
      desktop.toast(`${row.dataset.ask} is ${on ? 'on' : 'off'}. (Pretend: Burrow's users didn't notice.)`);
    });
  }

  // Trash --------------------------------------------------------------------------------------
  root.querySelector('[data-empty-trash]')?.addEventListener('click', () => {
    onEmptyTrash();
    desktop.toast('The mole buried it. (Nothing was deleted: it’s a website.)');
  });

  return {
    /** For the prompt: the visitor's estimate, if they have one. */
    estimate() {
      const total = totalRow.querySelector('.total').textContent;
      const parts = estimateParts();
      return parts.length ? { total, parts } : null;
    },
  };
}

// "2.4M", "10k", "1,500,000" → a number.
function parseAmount(value) {
  const m = /^\s*([\d.,\s]+)\s*([kmb])?\s*$/i.exec(String(value));
  if (!m) return 0;
  const n = Number(m[1].replace(/[,\s]/g, ''));
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase()] ?? 1;
  return Number.isFinite(n) ? Math.max(0, Math.round(n * scale)) : 0;
}

function compact(n) {
  if (n >= 1e6) return `${Number((n / 1e6).toFixed(1))}M`;
  return int.format(n);
}
