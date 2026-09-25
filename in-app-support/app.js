// The pretend print-farm app around the example. Nothing here talks to Stand.
// It renders the printers and gives the failed one a "Get help" button with
// data-support-* attributes, which support.js turns into a Stand conversation.

const printers = [
  {
    name: 'Heron', model: 'LX-2', bay: 'Bay 1', state: 'error', shape: 0,
    file: 'drone-arm_v7.gcode', material: 'PETG', color: '#FF7A1A',
    progress: 63, layer: [214, 340], nozzle: 188, target: 215, bed: 60,
    firmware: '4.3.1', serviced: 41,
    error: { code: 'E-217', title: 'Heater fault', detail: 'Nozzle fell from 215° to 188° at layer 214. Print paused.' },
  },
  { name: 'Kestrel', model: 'LX-2 Pro', bay: 'Bay 2', state: 'printing', shape: 1, file: 'gimbal-mount_x4.gcode', material: 'PLA', color: '#E9ECEF', progress: 81.2, left: 34, nozzle: 210, bed: 60 },
  { name: 'Wren', model: 'Mini-L', bay: 'Bay 3', state: 'printing', shape: 2, file: 'cable-clips_40x.gcode', material: 'PLA', color: '#5CC8FF', progress: 27.5, left: 142, nozzle: 205, bed: 55 },
  { name: 'Swift', model: 'LX-2', bay: 'Bay 4', state: 'done', shape: 3, file: 'enclosure-lid_v3.gcode', material: 'ASA', color: '#8B94A3', progress: 100, nozzle: 44, bed: 37 },
  { name: 'Plover', model: 'LX-2 Pro', bay: 'Bay 5', state: 'printing', shape: 4, file: 'prop-guard_L.gcode', material: 'PETG', color: '#FF7A1A', progress: 54.1, left: 88, nozzle: 240, bed: 80 },
  { name: 'Merlin', model: 'LX-2', bay: 'Bay 6', state: 'printing', shape: 5, file: 'sensor-housing_v12.gcode', material: 'TPU', color: '#9BE564', progress: 12.4, left: 206, nozzle: 228, bed: 50 },
  { name: 'Tern', model: 'Mini-L', bay: 'Bay 7', state: 'idle', shape: 6, material: 'PLA', color: '#FFD23F', progress: 0, nozzle: 24, bed: 23 },
  { name: 'Finch', model: 'LX-2', bay: 'Bay 8', state: 'printing', shape: 7, file: 'battery-tray_v2.gcode', material: 'PLA', color: '#FFD23F', progress: 96.8, left: 6, nozzle: 210, bed: 60 },
];

const LABELS = { printing: 'Printing', error: 'Needs attention', done: 'Done', idle: 'Ready' };

// Objects on the build plate, drawn in a 160×90 box standing on y = 80.
const SHAPES = [
  'M30 80 V60 H96 L112 44 A14 14 0 1 1 124 64 L112 80 Z',
  'M44 80 V36 L60 20 H100 L116 36 V80 Z',
  'M32 80 V58 H46 V80 Z M52 80 V58 H66 V80 Z M72 80 V58 H86 V80 Z M92 80 V58 H106 V80 Z M112 80 V58 H126 V80 Z',
  'M34 80 V52 H126 V80 Z',
  'M36 80 V42 A44 44 0 0 1 124 42 V80 H106 V46 A26 26 0 0 0 54 46 V80 Z',
  'M58 80 C52 62 50 40 62 18 H98 C110 40 108 62 102 80 Z',
  '',
  'M28 80 V56 H40 V68 H120 V56 H132 V80 Z',
];

function formatLeft(minutes) {
  const m = Math.max(0, Math.round(minutes));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

function camera(p) {
  const height = 64 * (p.progress / 100);
  const top = 80 - height;
  const id = p.name.toLowerCase();
  const shape = SHAPES[p.shape];
  return `
    <svg class="cam" viewBox="0 0 160 90" aria-hidden="true">
      <defs>
        <pattern id="layers-${id}" width="6" height="3" patternUnits="userSpaceOnUse">
          <rect width="6" height="3" fill="${p.color}"/><rect y="2.3" width="6" height=".7" fill="#000" opacity=".22"/>
        </pattern>
        <clipPath id="printed-${id}"><rect class="printed" x="0" y="${top}" width="160" height="${height}"/></clipPath>
      </defs>
      <rect x="14" y="80" width="132" height="5" rx="1.5" fill="#2A303A"/>
      ${shape ? `<path d="${shape}" fill="none" stroke="#3B4350" stroke-dasharray="2 3"/>
      <path d="${shape}" fill="url(#layers-${id})" clip-path="url(#printed-${id})"/>` : ''}
      <g class="head" style="transform: translateY(${p.state === 'done' || p.state === 'idle' ? 6 : top - 9}px)">
        <g class="sweep"><path d="M-9 0 h18 v4 l-5 6 h-8 l-5 -6 z"/></g>
      </g>
    </svg>`;
}

function renderPrinter(p) {
  const card = document.createElement('article');
  card.className = 'printer';
  card.dataset.state = p.state;
  card.innerHTML = `
    <header>
      <div><h2>${p.name}</h2><p>${p.model} · ${p.bay}</p></div>
      <span class="state">${LABELS[p.state]}</span>
    </header>
    ${camera(p)}
    <div class="job">
      <span class="file">${p.file ?? 'No job queued'}</span>
      <span class="material"><i style="background:${p.color}"></i>${p.material}</span>
    </div>
    <div class="bar"><span style="width:${p.progress}%"></span></div>
    <dl class="stats">
      <div><dt>Progress</dt><dd data-progress>${Math.floor(p.progress)}%</dd></div>
      <div><dt>${p.state === 'error' ? 'Layer' : 'Left'}</dt><dd data-left>${p.state === 'error' ? `${p.layer[0]}/${p.layer[1]}` : p.left ? formatLeft(p.left) : '—'}</dd></div>
      <div><dt>Nozzle</dt><dd data-nozzle>${Math.round(p.nozzle)}°</dd></div>
      <div><dt>Bed</dt><dd>${p.bed}°</dd></div>
    </dl>`;

  if (p.error) {
    const alert = document.createElement('div');
    alert.className = 'alert';
    alert.innerHTML = `<p><strong>${p.error.code} · ${p.error.title}</strong>${p.error.detail}</p>`;

    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'help';
    help.hidden = true; // support.js reveals it when Stand is available.
    help.textContent = `Get help with ${p.error.code}`;
    help.dataset.supportId = 'printer-error';
    help.dataset.supportGreeting = `I see ${p.name} paused with ${p.error.code}. Let's get it printing again. Did the nozzle temperature drop suddenly, or drift down over a few minutes?`;
    help.dataset.supportPrompt = `The user is looking at printer ${p.name} (${p.model}, firmware ${p.firmware}) in the Layerline dashboard. ` +
      `It paused with ${p.error.code} (${p.error.title.toLowerCase()}) at layer ${p.layer[0]} of ${p.layer[1]} while printing ${p.file} in ${p.material}: ` +
      `the nozzle fell from ${p.target} °C to ${p.nozzle} °C. Last maintenance was ${p.serviced} days ago. ` +
      'Troubleshoot step by step, starting with the heater cartridge and thermistor connectors. Do not suggest replacing parts before those checks.';

    const log = document.createElement('a');
    log.href = '#';
    log.className = 'log';
    log.textContent = 'View log';

    alert.append(help, log);
    card.querySelector('.bar').after(alert);
  }
  return card;
}

function renderKpis() {
  const printing = printers.filter((p) => p.state === 'printing').length;
  document.querySelector('[data-kpi-printing]').textContent = printing;
}

const grid = document.querySelector('[data-printers]');
const cards = printers.map(renderPrinter);
grid.append(...cards);
renderKpis();

// Keep the farm alive: prints advance, temperatures wobble.
setInterval(() => {
  printers.forEach((p, i) => {
    if (p.state !== 'printing') return;
    const card = cards[i];
    p.progress = Math.min(100, p.progress + 0.08);
    p.left = Math.max(0, p.left - 0.1);
    const wobble = p.nozzle + (Math.random() - 0.5) * 0.8;
    card.querySelector('[data-nozzle]').textContent = `${Math.round(wobble)}°`;
    card.querySelector('[data-progress]').textContent = `${Math.floor(p.progress)}%`;
    card.querySelector('[data-left]').textContent = formatLeft(p.left);
    card.querySelector('.bar span').style.width = `${p.progress}%`;
    const height = 64 * (p.progress / 100);
    card.querySelector('.printed').setAttribute('y', 80 - height);
    card.querySelector('.printed').setAttribute('height', height);
    card.querySelector('.head').style.transform = `translateY(${80 - height - 9}px)`;
    if (p.progress >= 100) {
      p.state = 'done';
      card.dataset.state = 'done';
      card.querySelector('.state').textContent = LABELS.done;
      card.querySelector('.head').style.transform = 'translateY(6px)';
      card.querySelector('[data-left]').textContent = '—';
      renderKpis();
    }
  });
}, 1500);
