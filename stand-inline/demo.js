// Demo helpers for the example pages, not part of Stand Inline: the "watch a
// sample conversation" buttons in each page's How it works section.
import { playSample, SCRIPTS } from './samples.js';

let playing = null;
const liveButtons = document.querySelectorAll('[data-live]');

for (const button of document.querySelectorAll('[data-sample]')) {
  button.addEventListener('click', () => {
    // The first one that's actually on screen: a page can hide one at some widths.
    const matches = [...document.querySelectorAll(button.dataset.target || 'stand-inline')];
    const element = matches.find((el) => el.getClientRects().length) ?? matches[0];
    const script = SCRIPTS[button.dataset.sample];
    if (!element || !script) return;
    playing?.abort();
    playing = new AbortController();
    for (const live of liveButtons) live.hidden = false;
    element.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    void playSample(element, script, { signal: playing.signal });
  });
}

for (const button of liveButtons) {
  button.addEventListener('click', () => {
    playing?.abort();
    for (const element of document.querySelectorAll('stand-inline')) element.client = null;
    for (const live of liveButtons) live.hidden = true;
  });
}
