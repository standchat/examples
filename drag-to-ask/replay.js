// Session replay: a 72-second recording of someone failing to apply a coupon,
// replayed from a script. frame(t) draws any moment, so the player can play,
// pause, seek and loop like the real thing. Every event in the list can be
// dragged onto Chat; clicking one jumps there.

const LENGTH = 72;
const TYPED = 'MOLE50';

export function initReplay(win, { isVisible }) {
  const screen = win.querySelector('.rp-screen');
  const cursor = win.querySelector('.rp-cursor');
  const ripple = win.querySelector('.rp-ripple');
  const typed = win.querySelector('.rp-typed');
  const apply = win.querySelector('.rp-apply');
  const pay = win.querySelector('.rp-pay');
  const playBtn = win.querySelector('.rp-play');
  const speedBtn = win.querySelector('.rp-speed');
  const track = win.querySelector('.rp-track');
  const now = win.querySelector('.rp-now');
  const events = [...win.querySelectorAll('.rp-events [data-t]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const speeds = [1, 2, 4];
  let speed = 2;
  let t = 0;
  let playing = false;
  let last = 0;
  let wantsPlay = !reduced.matches; // autoplay once it's on screen, unless motion is reduced

  // Where things are on the fake page, as fractions of the screen, so the
  // script survives resizing.
  const spot = (el, fx = 0.5, fy = 0.5) => {
    const s = screen.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!s.width) return [0, 0];
    return [r.left - s.left + r.width * fx, r.top - s.top + r.height * fy];
  };
  const input = win.querySelector('.rp-input');
  const keys = () => {
    const s = screen.getBoundingClientRect();
    return [
      [0, [s.width * 0.2, s.height * 0.92]],
      [4, spot(win.querySelector('.rp-plan'), 0.25, 0.6)],
      [11, spot(input, 0.3, 0.55)],
      [14, spot(input, 0.3, 0.55)],
      [26, spot(input, 0.75, 0.6)],
      [29.5, spot(apply, 0.5, 0.55)],
      [36, spot(apply, 0.3, 0.9)],
      [41.6, spot(apply, 0.52, 0.5)],
      [44, spot(apply, 0.56, 0.52)],
      [51, spot(pay, 0.4, 0.5)],
      [57, spot(pay, 0.55, 0.45)],
      [66, spot(pay, 0.62, 0.55)],
      [68.5, [s.width - 14, 10]],
      [LENGTH, [s.width - 14, 10]],
    ];
  };
  const clicks = [14, 30, 42, 42.4, 42.8, 43.2];

  function frame(time) {
    t = Math.max(0, Math.min(LENGTH, time));
    const k = keys();
    let i = k.findIndex(([at]) => at > t) - 1;
    if (i < 0) i = k.length - 2;
    const [t0, p0] = k[i];
    const [t1, p1] = k[i + 1];
    const f = ease(t1 === t0 ? 1 : (t - t0) / (t1 - t0));
    // A little hand tremor while hovering over Pay: hesitation.
    const shake = t > 57 && t < 66 ? Math.sin(t * 9) * 1.6 : 0;
    const x = p0[0] + (p1[0] - p0[0]) * f + shake;
    const y = p0[1] + (p1[1] - p0[1]) * f;
    cursor.style.setProperty('--cx', `${x}px`);
    cursor.style.setProperty('--cy', `${y}px`);

    const click = clicks.findLast((c) => t >= c && t < c + 0.45);
    ripple.classList.toggle('is-on', click !== undefined);
    if (click !== undefined) {
      ripple.style.setProperty('--cx', `${x}px`);
      ripple.style.setProperty('--cy', `${y}px`);
      ripple.style.setProperty('--rk', String((t - click) / 0.45));
    }
    const letters = t < 15 ? 0 : Math.min(TYPED.length, Math.floor((t - 15) / 1.6) + 1);
    typed.textContent = TYPED.slice(0, letters);
    screen.classList.toggle('is-typing', t >= 14 && t < 29);
    apply.classList.toggle('is-pressed', click !== undefined && click >= 30 && click < 44);
    screen.classList.toggle('has-error', t >= 31 && t < 68);
    screen.classList.toggle('is-rage', t >= 42 && t < 48);
    pay.classList.toggle('is-hover', t >= 56 && t < 66.5);
    screen.classList.toggle('is-ended', t >= 68.5);

    const p = t / LENGTH;
    track.style.setProperty('--p', String(p));
    track.setAttribute('aria-valuenow', String(Math.round(t)));
    track.setAttribute('aria-valuetext', clock(t));
    now.textContent = clock(t);
    const current = events.findLast((e) => Number(e.dataset.t) <= t);
    for (const e of events) e.classList.toggle('is-now', e === current);
  }

  function loop(stamp) {
    if (!playing) return;
    const dt = last ? Math.min(0.1, (stamp - last) / 1000) : 0;
    last = stamp;
    // Out of sight, out of frames: showing the window again resumes it (see the ResizeObserver).
    if (!isVisible()) return setPlaying(false);
    frame(t + dt * speed);
    if (t >= LENGTH) {
      // Hold the last frame a moment, then start over.
      setPlaying(false);
      setTimeout(() => { if (wantsPlay && !playing && t >= LENGTH) { frame(0); setPlaying(true); } }, 2400);
      return;
    }
    requestAnimationFrame(loop);
  }

  function setPlaying(on) {
    playing = on;
    playBtn.classList.toggle('is-playing', on);
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (on) {
      if (t >= LENGTH) frame(0);
      last = 0;
      requestAnimationFrame(loop);
    }
  }

  playBtn.addEventListener('click', () => {
    wantsPlay = !playing;
    setPlaying(!playing);
  });
  speedBtn.addEventListener('click', () => {
    speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    speedBtn.textContent = `${speed}×`;
  });
  const seek = (clientX) => {
    const r = track.getBoundingClientRect();
    frame(((clientX - r.left) / r.width) * LENGTH);
  };
  track.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { track.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    seek(e.clientX);
    const move = (ev) => seek(ev.clientX);
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', () => track.removeEventListener('pointermove', move), { once: true });
  });
  track.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key];
    if (step) frame(t + step);
    else if (e.key === 'Home') frame(0);
    else if (e.key === 'End') frame(LENGTH);
    else return;
    e.preventDefault();
  });
  for (const e of events) e.addEventListener('click', () => frame(Number(e.dataset.t) + 0.01));

  // Start when the window shows; draw the first frame once it has a size.
  new ResizeObserver(() => {
    if (!screen.getBoundingClientRect().width) return;
    frame(t);
    if (wantsPlay && !playing && isVisible() && t < LENGTH) setPlaying(true);
  }).observe(screen);
  frame(reduced.matches ? 42.2 : 0);
}

function ease(x) {
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

function clock(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
