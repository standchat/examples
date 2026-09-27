// The mole who lives in the corner of Molehill's desktop. Molehill's mascot,
// not the one answering: it never speaks in the chat. It peeks out when the
// page loads, digs while an answer is being written, and pops up with a flag
// when a reply lands while Chat is out of sight. Click it to open Chat.

const INK = '#151515';

const SVG = `
<svg class="mole-svg" viewBox="0 0 120 96" aria-hidden="true" focusable="false">
  <ellipse cx="60" cy="90.5" rx="55" ry="4.5" fill="rgba(0,0,0,.13)"/>
  <path class="hill-back" d="M6 90C12 66 34 54 60 54s48 12 54 36Z" fill="#8A5A3B" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="60" cy="58" rx="20" ry="5.5" fill="#34200F"/>
  <g class="mole">
    <path d="M39 76C39 48 47 32 60 32s21 16 21 44Z" fill="#4B4442" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M58.5 32.5c.4-3.4 1.6-5.2 3.4-6M61.5 32.4c1.6-2.8 3.6-3.9 6-3.9" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="52.5" cy="38.5" rx="6" ry="3" fill="#6D6461" opacity=".7"/>
    <g class="mole-eyes">
      <circle cx="53" cy="45.5" r="5.6" fill="#FDFDF8" stroke="${INK}" stroke-width="2"/>
      <circle cx="67" cy="45.5" r="5.6" fill="#FDFDF8" stroke="${INK}" stroke-width="2"/>
      <path d="M58.6 45.2h2.8" stroke="${INK}" stroke-width="2"/>
      <g class="mole-pupils">
        <circle cx="53.6" cy="46" r="1.9" fill="${INK}"/>
        <circle cx="67.6" cy="46" r="1.9" fill="${INK}"/>
      </g>
    </g>
    <path d="M53.5 54.5l-8-1.2M53.5 56l-7.6 2M66.5 54.5l8-1.2M66.5 56l7.6 2" stroke="${INK}" stroke-width="1" stroke-linecap="round" opacity=".55"/>
    <ellipse cx="60" cy="54" rx="4.6" ry="3.6" fill="#F08A96" stroke="${INK}" stroke-width="1.6"/>
    <circle cx="58.7" cy="52.9" r="1" fill="#fff"/>
    <path d="M57.4 58.8q2.6 2 5.2 0" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
  </g>
  <path class="hill-front" d="M6 90C12 68 28 58.6 40 58A20 5.5 0 0 0 80 58c12 .6 28 10 34 32Z" fill="#8A5A3B" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  <g fill="#6B4328">
    <ellipse cx="30" cy="76" rx="3" ry="1.8"/><ellipse cx="46" cy="83" rx="2.4" ry="1.5"/><ellipse cx="86" cy="80" rx="3.2" ry="1.9"/><ellipse cx="97" cy="72" rx="2" ry="1.3"/><ellipse cx="64" cy="75" rx="2.2" ry="1.4"/>
  </g>
  <g fill="#B07B55">
    <ellipse cx="38" cy="70" rx="1.8" ry="1.1"/><ellipse cx="74" cy="86" rx="2.2" ry="1.2"/><ellipse cx="20" cy="84" rx="1.8" ry="1.1"/><ellipse cx="102" cy="84" rx="1.6" ry="1"/>
  </g>
  <path d="M104 88c-1-5 0-9 2-12M108 88c0-4 1.5-7 4-9M100 88c-1.6-3-4-5-6.6-5.6" fill="none" stroke="#2F9E44" stroke-width="2.2" stroke-linecap="round"/>
  <g class="mole-paws">
    <g transform="translate(45 63)"><ellipse rx="6.4" ry="4.2" fill="#F4A7A0" stroke="${INK}" stroke-width="1.6"/><path d="M-3.4 2.2v2.2M0 2.6v2.4M3.4 2.2v2.2" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/></g>
    <g transform="translate(75 63)"><ellipse rx="6.4" ry="4.2" fill="#F4A7A0" stroke="${INK}" stroke-width="1.6"/><path d="M-3.4 2.2v2.2M0 2.6v2.4M3.4 2.2v2.2" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/></g>
  </g>
  <g class="mole-flag">
    <path d="M78 62 90 26" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M90 26l16 5.4-12.6 6.6Z" fill="#F54E00" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="97.5" cy="31.2" r="1.9" fill="#FDFDF8"/>
  </g>
  <g class="mole-dirt" fill="#8A5A3B" stroke="${INK}" stroke-width="1">
    <circle cx="60" cy="58" r="2.4" style="--dx:-26px;--dy:-30px;--d:0s"/>
    <circle cx="60" cy="58" r="1.8" style="--dx:22px;--dy:-34px;--d:.12s"/>
    <circle cx="60" cy="58" r="2.2" style="--dx:-12px;--dy:-40px;--d:.24s"/>
    <circle cx="60" cy="58" r="1.6" style="--dx:30px;--dy:-22px;--d:.36s"/>
    <circle cx="60" cy="58" r="2" style="--dx:6px;--dy:-44px;--d:.48s"/>
  </g>
</svg>`;

export function createMole(container, { onClick } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  container.innerHTML = `<button type="button" class="mole-btn" aria-label="Open Chat">${SVG}</button><p class="mole-say" hidden></p>`;
  const button = container.querySelector('.mole-btn');
  const say = container.querySelector('.mole-say');
  let pose = 'hidden';
  let digging = false;
  let flagged = false;
  let sayTimer = 0;
  let nodTimer = 0;

  button.addEventListener('click', () => {
    hush();
    onClick?.();
  });

  function show() {
    const next = flagged ? 'flag' : digging ? 'dig' : pose;
    container.dataset.pose = next;
    button.setAttribute('aria-label', flagged ? 'New reply in Chat. Open Chat' : 'Open Chat');
  }

  // A blink now and then, only while the mole is out.
  (function blink() {
    setTimeout(() => {
      if (!reduced.matches && container.dataset.pose !== 'hidden' && !document.hidden) {
        container.classList.add('is-blinking');
        setTimeout(() => container.classList.remove('is-blinking'), 150);
      }
      blink();
    }, 2800 + Math.random() * 3600);
  })();

  function speak(text, ms = 5200) {
    clearTimeout(sayTimer);
    say.textContent = text;
    say.hidden = false;
    if (ms) sayTimer = setTimeout(hush, ms);
  }

  function hush() {
    clearTimeout(sayTimer);
    say.hidden = true;
  }

  return {
    /** hidden → peek: the first hello. */
    peek() {
      pose = 'peek';
      show();
    },
    dig(on) {
      if (digging === on) return;
      digging = on;
      show();
    },
    flag(on) {
      if (flagged === on) return;
      flagged = on;
      if (on) hush();
      show();
    },
    /** Nobody can answer right now: the mole dozes off. */
    sleep(on) {
      container.classList.toggle('is-asleep', on);
      button.setAttribute('aria-label', on ? 'Open Chat (nobody is around right now)' : flagged ? 'New reply in Chat. Open Chat' : 'Open Chat');
    },
    /** A quick pop up when something lands in Chat. */
    nod() {
      if (flagged || digging || reduced.matches) return;
      clearTimeout(nodTimer);
      container.dataset.pose = 'up';
      nodTimer = setTimeout(show, 700);
    },
    speak,
    hush,
  };
}
