// Molehill's desktop, and Chat on it. The pieces:
//   stand-visitor.js   the conversation with Stand (network, recovery), no UI
//   message-format.js  attachments as lines of text, references in replies
//   prompt.js          private context for whoever answers
//   desktop.js         windows, menus, taskbar, the phone home screen
//   drag.js            dragging anything onto Chat, and every way around dragging
//   chat.js            Chat itself: renders the client's state
//   apps.js, chart.js, replay.js   what's inside the windows
//   mole.js, intro.js  the mascot, and the first visit's demonstration

import { getClient } from './stand-visitor.js';
import { createDesktop } from './desktop.js';
import { initApps } from './apps.js';
import { createMole } from './mole.js';
import { createChat } from './chat.js';
import { initDrag } from './drag.js';
import { playIntro } from './intro.js';
import { buildPrompt } from './prompt.js';

const root = document.getElementById('mh');
const liveDraft = document.querySelector('[data-live="draft"] code');
const livePrompt = document.querySelector('[data-live="prompt"] code');
let liveFrame = 0;

const desktop = createDesktop(root);
const mole = createMole(root.querySelector('.mh-molehill'), { onClick: () => desktop.open('chat') });
const apps = initApps(root, desktop, {
  onChange: () => refreshLive(),
  onEmptyTrash: () => {
    mole.dig(true);
    setTimeout(() => mole.dig(false), 1600);
  },
});

// Stand Chat's shared demo site: works on any domain. Use your Site ID from Stand.
const client = getClient({ site: 'demo' });
const context = () => ({ open: desktop.openNames(), estimate: apps.estimate(), phone: desktop.phone });
const chat = createChat({
  root,
  el: root.querySelector('#chat'),
  win: root.querySelector('#win-chat'),
  client,
  desktop,
  mole,
  context,
});
const drag = initDrag({ root, desktop, chat });

client.subscribe((state) => {
  chat.render(state);
  refreshLive();
});
client.mount();
desktop.on(() => refreshLive());

// The first visit gets the demonstration; later visits and reloads don't.
const { load, store } = desktop.storage;
const hasConversation = client.getSnapshot().messages.length > 0 || Boolean(client.getSnapshot().draft);
if (!load().intro && !hasConversation) {
  store({ ...load(), intro: true });
  playIntro({ root, desktop, chat, mole, drag });
} else {
  setTimeout(() => mole.peek(), 400);
}

// "How it works": the next message and the prompt, live from this page ----------------

function refreshLive() {
  cancelAnimationFrame(liveFrame);
  liveFrame = requestAnimationFrame(() => {
    const draft = client.getSnapshot().draft;
    if (liveDraft) liveDraft.textContent = draft || '(Nothing attached yet. Drag something onto Chat.)';
    if (livePrompt) livePrompt.textContent = buildPrompt(context());
  });
}
for (const pre of document.querySelectorAll('pre[data-live]')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dta-copy';
  button.textContent = 'Copy';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector('code').textContent.trim());
      button.textContent = 'Copied';
    } catch {
      getSelection().selectAllChildren(pre.querySelector('code'));
      button.textContent = 'Selected';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 1600);
  });
  pre.append(button);
}
refreshLive();
