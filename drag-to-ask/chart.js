// The trends chart in Product analytics. It reads its numbers from the table
// in the HTML (which screen readers and crawlers read too) and draws them as
// SVG. Every week is a column you can hover, focus and drag: grab near a
// line and you drag that point; anywhere else in the column, the whole week.

const NS = 'http://www.w3.org/2000/svg';
const M = { top: 10, right: 10, bottom: 22, left: 36 };

export function initChart(box) {
  const table = box.querySelector('table');
  const series = [...table.querySelectorAll('thead th[data-series]')].map((th, i) => ({
    name: th.textContent.trim(),
    color: th.dataset.series,
    values: [...table.querySelectorAll('tbody tr')].map((tr) => Number(tr.cells[i + 1].textContent)),
  }));
  const weeks = [...table.querySelectorAll('tbody tr')].map((tr) => ({
    label: tr.cells[0].textContent.trim(),
    note: tr.dataset.note ?? '',
    partial: tr.hasAttribute('data-partial'),
  }));
  const max = Math.ceil(Math.max(...series.flatMap((s) => s.values)) / 500) * 500;
  const fmt = new Intl.NumberFormat('en-US');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const cols = document.createElement('div');
  cols.className = 'pa-cols';
  cols.dataset.askGroup = '';
  cols.dataset.askRow = '';
  cols.setAttribute('aria-label', 'Weeks');
  const tip = document.createElement('div');
  tip.className = 'pa-tip';
  tip.hidden = true;
  box.append(svg, cols, tip);
  box.classList.add('is-drawn');

  let geometry = null;
  let hover = -1;

  // One column per week: the thing you drag, focus and ask about.
  weeks.forEach((week, i) => {
    const col = document.createElement('div');
    col.className = 'pa-col';
    col.dataset.ask = `Week of ${week.label}`;
    col.dataset.alias = week.label;
    col.dataset.pill = 'bottom';
    col.setAttribute('role', 'button');
    col.setAttribute('aria-label', `Week of ${week.label}: ${series.map((s) => `${s.name} ${fmt.format(s.values[i])}`).join(', ')}${week.partial ? ' (week in progress)' : ''}${week.note ? `. Note: ${week.note}` : ''}`);
    col.askPayload = (event) => payload(i, event);
    col.addEventListener('pointerenter', () => show(i));
    col.addEventListener('pointerleave', () => show(-1));
    col.addEventListener('focus', () => show(i));
    col.addEventListener('blur', () => show(-1));
    cols.append(col);
  });

  function payload(i, event) {
    const week = weeks[i];
    const near = event && nearestSeries(i, event.clientY);
    if (near) {
      return {
        source: 'Product analytics',
        item: `${near.name}, week of ${week.label}`,
        value: `${fmt.format(near.values[i])} users${week.partial ? ' so far this week' : ''}${week.note ? `; ${week.note}` : ''}`,
        icon: 'analytics',
      };
    }
    return {
      source: 'Product analytics',
      item: `Week of ${week.label}`,
      value: `${series.map((s) => `${s.name.toLowerCase()} ${fmt.format(s.values[i])}`).join(', ')}${week.partial ? ', week in progress' : ''}${week.note ? `; ${week.note}` : ''}`,
      icon: 'analytics',
    };
  }

  function nearestSeries(i, clientY) {
    if (!geometry) return null;
    const top = svg.getBoundingClientRect().top;
    let best = null;
    let distance = 14;
    for (const s of series) {
      const d = Math.abs(top + geometry.y(s.values[i]) - clientY);
      if (d < distance) {
        best = s;
        distance = d;
      }
    }
    return best;
  }

  function draw() {
    const width = box.clientWidth;
    const height = box.clientHeight;
    if (width < 40 || height < 40) return;
    const plotW = width - M.left - M.right;
    const plotH = height - M.top - M.bottom;
    const x = (i) => M.left + (weeks.length === 1 ? plotW / 2 : (i / (weeks.length - 1)) * plotW);
    const y = (v) => M.top + plotH - (v / max) * plotH;
    geometry = { x, y };
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();

    const grid = el('g', { class: 'pa-grid' });
    const axis = el('g', { class: 'pa-axis' });
    for (let v = 0; v <= max; v += 500) {
      grid.append(el('line', { x1: M.left, x2: width - M.right, y1: y(v), y2: y(v) }));
      axis.append(el('text', { x: M.left - 7, y: y(v) + 3.5, 'text-anchor': 'end' }, v >= 1000 ? `${v / 1000}k` : String(v)));
    }
    const every = plotW / weeks.length < 44 ? 3 : 2;
    weeks.forEach((week, i) => {
      if (i % every === 0 || i === weeks.length - 1) {
        axis.append(el('text', { x: x(i), y: height - 6, 'text-anchor': i === 0 ? 'start' : i === weeks.length - 1 ? 'end' : 'middle' }, week.label));
      }
    });
    svg.append(grid, axis);

    const settled = weeks.findIndex((w) => w.partial);
    const end = settled === -1 ? weeks.length : settled;
    series.forEach((s, n) => {
      const color = `var(--${s.color})`;
      const points = s.values.map((v, i) => [x(i), y(v)]);
      if (n === 0) {
        const area = `M${points[0][0]} ${y(0)}L${points.slice(0, end).map((p) => p.join(' ')).join('L')}L${points[end - 1][0]} ${y(0)}Z`;
        svg.append(el('path', { d: area, class: 'pa-area', fill: color }));
      }
      svg.append(el('path', { d: `M${points.slice(0, end).map((p) => p.join(' ')).join('L')}`, class: 'pa-line', stroke: color }));
      if (end < points.length) {
        svg.append(el('path', { d: `M${points.slice(end - 1).map((p) => p.join(' ')).join('L')}`, class: 'pa-line is-partial', stroke: color }));
      }
      const last = points[end - 1];
      svg.append(el('circle', { cx: last[0], cy: last[1], r: 3.2, class: 'pa-dot', stroke: color }));
    });

    // The annotation: a deploy marked on the chart.
    box.querySelector('.pa-note')?.remove();
    weeks.forEach((week, i) => {
      if (!week.note) return;
      svg.append(el('line', { x1: x(i), x2: x(i), y1: M.top + 12, y2: y(0), class: 'pa-note-line', stroke: 'var(--muted)', 'stroke-dasharray': '2 3' }));
      const flag = document.createElement('span');
      flag.className = 'pa-note';
      flag.textContent = '!';
      flag.style.left = `${x(i)}px`;
      flag.style.top = `${M.top + 4}px`;
      flag.title = week.note;
      box.append(flag);
    });

    cols.style.inset = `0 ${M.right}px ${M.bottom}px ${M.left - plotW / (weeks.length - 1) / 2}px`;
    cols.style.width = `${plotW + plotW / (weeks.length - 1)}px`;
    if (hover >= 0) show(hover);
  }

  function show(i) {
    hover = i;
    svg.querySelector('.pa-hover')?.remove();
    for (const c of cols.children) c.classList.toggle('is-hover', c === cols.children[i]);
    if (i < 0 || !geometry) return void (tip.hidden = true);
    const { x, y } = geometry;
    const g = el('g', { class: 'pa-hover' });
    g.append(el('line', { x1: x(i), x2: x(i), y1: M.top, y2: y(0), stroke: 'var(--line)', 'stroke-width': 1 }));
    for (const s of series) g.append(el('circle', { cx: x(i), cy: y(s.values[i]), r: 4, class: 'pa-dot', stroke: `var(--${s.color})` }));
    svg.append(g);
    const week = weeks[i];
    tip.replaceChildren();
    const title = document.createElement('b');
    title.textContent = `Week of ${week.label}${week.partial ? ' (so far)' : ''}`;
    tip.append(title);
    for (const s of series) {
      const row = document.createElement('span');
      row.dataset.color = s.color;
      row.innerHTML = '<i></i>';
      row.append(s.name, Object.assign(document.createElement('em'), { textContent: fmt.format(s.values[i]) }));
      tip.append(row);
    }
    if (week.note) tip.append(Object.assign(document.createElement('small'), { textContent: `⚑ ${week.note}` }));
    tip.hidden = false;
    const left = x(i) + 14;
    tip.style.left = left + tip.offsetWidth > box.clientWidth ? `${x(i) - tip.offsetWidth - 14}px` : `${left}px`;
  }

  new ResizeObserver(draw).observe(box);
  draw();
}

function el(tag, attrs = {}, text = '') {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}
