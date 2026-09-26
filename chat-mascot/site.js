// Tidelight's live details: whether the aquarium is open and what's on next,
// read from the visitor's own clock. Without this file the page still reads fine.
(() => {
  const OPENS = 9 * 60 + 30;
  const CLOSES = 17 * 60 + 30;
  const LATE_CLOSES = 21 * 60; // Thursdays: Tidelight After Dark.
  const THURSDAY = 4;

  const minutesOf = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const clock = (minutes) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  const fromNow = (minutes) => {
    if (minutes < 1) return 'starting now';
    if (minutes < 60) return `in ${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `in ${h} h ${m} min` : `in ${h} h`;
  };
  const setText = (root, selector, text) => {
    const el = root.querySelector(selector);
    if (el) el.textContent = text;
  };

  function update() {
    const now = new Date();
    const day = now.getDay();
    const time = now.getHours() * 60 + now.getMinutes();
    const closes = day === THURSDAY ? LATE_CLOSES : CLOSES;
    const open = time >= OPENS && time < closes;

    const status = document.querySelector('[data-open-status]');
    if (status) {
      status.dataset.state = open ? 'open' : 'closed';
      setText(status, '[data-open-text]',
        open ? `Open ${day === THURSDAY ? 'late tonight' : 'now'}, until ${clock(closes)}`
          : time < OPENS ? `Opens today at ${clock(OPENS)}`
          : `Closed now. Opens tomorrow at ${clock(OPENS)}`);
    }
    setText(document, '[data-today-date]', now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
    for (const row of document.querySelectorAll('[data-days]')) {
      row.classList.toggle('is-today', row.dataset.days.split(' ').includes(String(day)));
    }

    // Today's schedule: done, happening now, next.
    let current = null;
    let next = null;
    let first = null;
    for (const event of document.querySelectorAll('[data-event]')) {
      if (event.dataset.weekday) event.hidden = Number(event.dataset.weekday) !== day;
      if (event.hidden) continue;
      const start = minutesOf(event.dataset.time);
      const end = start + Number(event.dataset.duration || 15);
      const state = time >= end ? 'done' : time >= start ? 'now' : 'later';
      const item = { event, start, end, title: event.querySelector('h3').textContent, where: event.querySelector('.tl-event-where').textContent };
      first ??= item;
      if (state === 'now') current ??= item;
      if (state === 'later') next ??= item;
      event.classList.toggle('is-done', state === 'done');
      event.classList.toggle('is-now', state === 'now');
      event.classList.remove('is-next');
      setText(event, '[data-state]', state === 'done' ? 'Done' : state === 'now' ? 'Happening now' : '');
    }
    if (next) {
      next.event.classList.add('is-next');
      setText(next.event, '[data-state]', `Next, ${fromNow(next.start - time)}`);
    }

    const card = document.querySelector('[data-next]');
    if (!card || !first) return;
    const show = (label, when, item, where) => {
      setText(card, '[data-next-label]', label);
      setText(card, '[data-next-when]', when);
      setText(card, '[data-next-title]', item.title);
      setText(card, '[data-next-where]', where);
    };
    if (current) show('Happening now', `until ${clock(current.end)}`, current, current.where);
    else if (next) show(next === first ? 'First up today' : 'Next up', fromNow(next.start - time), next, `${clock(next.start)} · ${next.where}`);
    else show('That’s all for today', clock(first.start), first, `First up tomorrow · ${first.where}`);
  }

  update();
  setInterval(update, 30000);

  // The small-screen menu closes after a choice, a click elsewhere or Escape.
  const menu = document.querySelector('.tl-menu');
  if (menu) {
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) menu.open = false;
    });
    document.addEventListener('click', (event) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
      }
    });
  }
})();
