// Scripted sample conversations, for the studio and the examples' "Watch a
// sample" buttons. A SampleClient has the same shape as StandVisitorClient but
// talks to nobody: nothing is sent, and <stand-inline> labels it as a sample.
// Not part of the element; you don't need this file on your site.

import { INITIAL_STATE } from './stand-visitor.js';

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(signal.reason ?? new DOMException('Stopped', 'AbortError'));
  }, { once: true });
});

export class SampleClient {
  sample = true;
  #state;
  #listeners = new Set();
  #script;
  #seq = 0;
  #turn = 0;
  #stop = new AbortController();

  constructor(script) {
    this.#script = script;
    this.#state = this.#initial();
  }

  #initial() {
    return {
      ...INITIAL_STATE,
      phase: 'available',
      host: { name: '', title: '', avatar: '', kind: 'standin', ...this.#script.host },
      notice: this.#script.notice ?? '',
      poweredByUrl: 'https://stand.chat/',
    };
  }

  getSnapshot() {
    return this.#state;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  mount() {
    return () => {};
  }

  dispose() {
    this.#stop.abort();
  }

  retry() {}
  typing() {}
  trackLinkClick() {}
  trackAttributionClick() {}

  setDraft(draft) {
    if (draft !== this.#state.draft) this.#update({ draft });
  }

  setOwner(owner) {
    if (owner !== this.#state.owner) this.#update({ owner });
  }

  async send(text = '', context = {}) {
    const body = String(text).trim();
    if (!body || this.#state.busy) return false;
    const signal = this.#stop.signal;
    const first = !this.#state.messages.length;
    try {
      this.#update({ busy: true, pending: { body, clientMessageId: 'sample', creating: first } });
      await sleep(first ? 650 : 380, signal);
      const messages = [...this.#state.messages];
      if (first && context.greeting) messages.push(this.#message('standin', context.greeting));
      messages.push(this.#message('visitor', body));
      if (first && this.#state.host.kind === 'standin') {
        messages.push(this.#card({ cardType: 'session-start', standinName: this.#state.host.name }));
      }
      this.#update({ busy: false, pending: null, phase: 'active', connection: 'online', messages });
      await this.#answer(signal);
      return true;
    } catch {
      return false;
    }
  }

  async end() {
    this.#update({ phase: 'ended', connection: 'offline', activity: null, followupOffered: false });
  }

  async newChat() {
    this.#turn = 0;
    this.#state = { ...this.#initial(), owner: this.#state.owner };
    this.#emit();
  }

  async submitEmail() {
    this.#push(this.#card({ cardType: 'rep-followup-confirmation' }));
    await this.end();
    return true;
  }

  // Plays the host's side of the next exchange in the script.
  async #answer(signal) {
    const turns = this.#script.turns;
    // Skip to the events after the next visitor line, whatever the visitor typed.
    while (this.#turn < turns.length && !turns[this.#turn].visitor) this.#turn++;
    this.#turn++;
    const events = [];
    while (this.#turn < turns.length && !turns[this.#turn].visitor) events.push(turns[this.#turn++]);
    if (!events.length) events.push({ reply: this.#script.fallback ?? FALLBACK, think: 900 });

    for (const event of events) {
      if (event.card) {
        await sleep(event.wait ?? 700, signal);
        if (event.host) this.#update({ host: { ...this.#state.host, avatar: '', title: '', ...event.host } });
        this.#push(this.#card(event.card));
        if (event.card.cardType === 'rep-followup-offer') this.#update({ followupOffered: true });
        continue;
      }
      if (event.link) {
        await sleep(event.wait ?? 450, signal);
        this.#push({ ...this.#message(this.#sender(), ''), type: 'link-card', body: JSON.stringify(event.link) });
        continue;
      }
      const kind = this.#state.host.kind === 'rep' ? 'typing' : 'thinking';
      this.#update({ activity: { kind, preview: '' } });
      await sleep(event.think ?? (kind === 'typing' ? 2200 : 1500), signal);
      if (event.stream) {
        // Stand streams AI replies as a growing preview of the whole text.
        const words = event.reply.split(/(?<=\s)/);
        let preview = '';
        for (const word of words) {
          preview += word;
          this.#update({ activity: { kind: 'thinking', preview } });
          await sleep(28 + Math.random() * 30, signal);
        }
      }
      this.#update({ activity: null });
      this.#push(this.#message(this.#sender(), event.reply));
    }
  }

  #sender() {
    return this.#state.host.kind === 'rep' ? 'rep' : 'standin';
  }

  #message(senderType, body) {
    this.#seq += 1;
    return { messageId: `sample-${this.#seq}`, seq: this.#seq, type: 'text', senderType, body, sentAt: new Date().toISOString() };
  }

  #card(card) {
    return { ...this.#message('system-card', JSON.stringify(card)), type: 'system-card' };
  }

  #push(message) {
    this.#update({ messages: [...this.#state.messages, message] });
  }

  #update(patch) {
    this.#state = { ...this.#state, ...patch };
    this.#emit();
  }

  #emit() {
    for (const listener of [...this.#listeners]) listener(this.#state);
  }
}

const FALLBACK = 'This is a sample, so my replies are scripted. Switch to the live chat to talk with Stand’s demo Stand-in.';

/**
 * Plays a script through an element: types each visitor line into its box,
 * sends it, and waits for the scripted replies. Stop it with the signal.
 */
export async function playSample(element, script, { signal, pace = 1 } = {}) {
  // The element may still be upgrading, in its own window (the studio's frame).
  await element.ownerDocument.defaultView.customElements.whenDefined(element.localName);
  const client = new SampleClient(script);
  signal?.addEventListener('abort', () => client.dispose(), { once: true });
  element.client = client;
  try {
    await sleep(700 * pace, signal);
    for (const turn of script.turns) {
      if (!turn.visitor) continue;
      if (turn.quote) {
        element.quote = turn.quote;
        await sleep(600 * pace, signal);
      }
      let typed = '';
      for (const char of turn.visitor) {
        typed += char;
        element.draft = typed;
        await sleep((22 + Math.random() * 38) * pace, signal);
      }
      await sleep(380 * pace, signal);
      await element.ask(turn.visitor);
      await sleep(1300 * pace, signal);
    }
    return client;
  } catch (error) {
    if (!signal?.aborted) console.error('Sample stopped:', error);
    return client;
  }
}

// One script per example page. Visitor lines are typed; everything after a
// visitor line until the next one is the reply.
export const SCRIPTS = {
  docs: {
    host: { name: 'Tidewire Docs', kind: 'standin', title: 'AI Stand-in · knows these docs' },
    turns: [
      { visitor: 'Why does my signature never match?' },
      { reply: 'Almost always because the body was parsed before it was verified. Tidewire signs the **raw bytes** of the request, and re-serialized JSON never matches:\n\n1. Read the raw body before any JSON middleware runs.\n2. Sign `timestamp + "." + rawBody` with your endpoint secret.\n3. Compare with `crypto.timingSafeEqual`, not `===`.\n\nIn Express, that means `express.raw({ type: "application/json" })` on the webhook route only.', stream: true },
      { quote: 'Signatures older than five minutes are rejected, to stop replayed deliveries.', visitor: 'Can I make that window longer?' },
      { reply: 'You can, but think twice. `verify()` takes a `tolerance` in seconds:\n\n```js\ntidewire.webhooks.verify(rawBody, header, secret, { tolerance: 600 });\n```\n\nThe window is what makes a captured request useless to an attacker, so keep it as short as your queue allows. If deliveries arrive late, it’s usually a slow consumer: acknowledge first, process later.' },
      { link: { url: 'https://docs.tidewire.example/webhooks/retries', title: 'Retries and idempotency', description: 'How Tidewire retries failed deliveries, and how to deduplicate them.' } },
    ],
  },
  careers: {
    host: { name: 'Paperbark Hiring', kind: 'standin', title: 'AI Stand-in · a recruiter can join' },
    turns: [
      { visitor: 'Is it fully remote?' },
      { reply: 'Yes. The role is remote within European time zones, from UTC−1 to UTC+3. The whole team meets twice a year, travel paid, and there’s a €150 monthly co-working budget if you’d rather not work from home.' },
      { visitor: 'What does the design exercise look like? I’d rather not do spec work.' },
      { reply: 'No spec work, promise. It’s a 90-minute conversation, not homework: you walk us through a project you’re proud of, then we sketch together on a real, already-shipped Paperbark screen. You get the screen a day ahead.' },
      { visitor: 'Could I talk to someone about visa sponsorship?' },
      { card: { cardType: 'handoff', repName: 'Noor Haddad', repTitle: 'Talent partner' }, host: { name: 'Noor Haddad', title: 'Talent partner', kind: 'rep' }, wait: 1100 },
      { reply: 'Hi, Noor here from the hiring team 👋 We sponsor work permits in the Netherlands and Portugal, and we cover the relocation. Where are you based at the moment?', think: 2600 },
    ],
  },
  product: {
    host: { name: 'Northfold', kind: 'standin', title: 'AI Stand-in · gear guide' },
    turns: [
      { visitor: 'Will two people and a medium-sized dog fit?' },
      { reply: 'Two adults fit comfortably: the floor is 218 × 132 cm. A medium dog works if it sleeps across your feet, with packs in the two vestibules.\n\nIf your dog likes to stretch out, the **Tern 3** is the relaxed choice: 38 cm wider for 320 g more.' },
      { visitor: 'How does it handle strong wind?' },
      { reply: 'Better than most tents this light. Pitch the narrow end into the wind and use all six guy-out points:\n\n- **The two front guylines** take most of the load.\n- **Side pull-outs** stop the fly flapping against the inner.\n- The hub pole stayed rigid to about **60 km/h** in our tests.\n\nAbove that, pitch behind a ridge or trees.', stream: true },
      { link: { url: 'https://northfold.example/guides/tern-in-wind', title: 'Pitching the Tern 2 in wind · 3 min video', description: 'Guyline order, stake angles, and the one knot you need.' } },
      { visitor: 'Nice. Is it OK for winter camping?' },
      { reply: 'It’s a three-season tent: great from spring into late autumn, but the mesh inner gets cold below about −5 °C, and it isn’t built for snow load. For winter, look at the **Skua 2**, with a solid inner and stronger poles.' },
    ],
  },
  help: {
    host: { name: 'Porchlight', kind: 'standin', title: 'AI Stand-in · a person can join' },
    turns: [
      { visitor: 'Why is my bill higher this month?' },
      { reply: 'Usually it’s one of three things:\n\n1. **Seasonal use**: heating can double gas use in colder months.\n2. **An estimated reading**: without a reading we estimate, and estimates can run high.\n3. **A price change**: the winter tariff started on 1 October.\n\nIf your bill says *estimated*, sending a reading today replaces the estimate on your next bill.', stream: true },
      { visitor: 'It says estimated. Can someone check my account?' },
      { card: { cardType: 'handoff', repName: 'Jonas Berg', repTitle: 'Customer care' }, host: { name: 'Jonas Berg', title: 'Customer care', kind: 'rep' }, wait: 1200 },
      { reply: 'Hi, I’m Jonas from customer care. I can see the estimate from 3 October. Send me today’s meter reading and I’ll correct the bill right away. What does your meter show?', think: 2400 },
    ],
  },
  pricing: {
    host: { name: 'Loomwork', kind: 'standin', title: 'AI Stand-in · plans and billing' },
    turns: [
      { visitor: 'We’re a team of 12 and we mostly plan product launches.' },
      { reply: 'For 12 people planning launches, **Team** fits best: timelines, dependencies and guest access for agencies are all included. That’s €144 a month, or €1,382 a year billed annually.\n\n**Business** only earns its price if you need SSO or audit logs. Do you?', stream: true },
      { visitor: 'No SSO. Can we try Team first?' },
      { reply: 'Yes. Every workspace starts with a 30-day **Team** trial, no card needed, and you can invite all 12 people during it. If you stay on the free **Starter** plan afterwards, your projects stay put.' },
    ],
  },
  contact: {
    host: { name: 'Studio Halden', kind: 'standin', title: 'AI Stand-in · an architect follows up' },
    turns: [
      { visitor: 'A new house on a sloped plot' },
      { reply: 'Lovely: slopes make the best houses. A few questions, so the right architect gets back to you:\n\n1. Where is the plot, and which way does it face?\n2. Roughly how big a house are you imagining?\n3. Do you have a budget range and a timeline?' },
      { visitor: 'Near Bergen, facing west over the fjord. About 180 m², and we’d like to build in spring 2027.' },
      { reply: 'A west-facing fjord slope is a gift: evening light, and a view to build around. At 180 m², a house on a slope often works as two offset levels that step with the ground instead of fighting it.\n\nSpring 2027 is realistic if design starts this winter. Ingrid led our last three projects on the west coast, so I’ll bring her in.', stream: true },
      { card: { cardType: 'handoff', repName: 'Ingrid Vold', repTitle: 'Architect · partner' }, host: { name: 'Ingrid Vold', title: 'Architect · partner', kind: 'rep' }, wait: 1400 },
      { reply: 'Hi, I’m Ingrid. Two offset levels would be my instinct too. Do you have a site plan or a few photos of the plot? With those, we can have a proper first conversation next week.', think: 2600 },
    ],
  },
  concierge: {
    host: { name: 'Tundra & Tide', kind: 'standin', title: 'AI Stand-in · trip planner' },
    turns: [
      { visitor: 'Somewhere we can see the northern lights with kids' },
      { reply: 'Then I’d start with **Abisko** in Swedish Lapland. It sits under a “blue hole” with some of the clearest winter skies in Europe, and the family lodge is a short train ride from Kiruna: no long drives with tired kids.\n\nHow old are your children, and when could you travel?', stream: true },
      { visitor: '7 and 10. February half-term?' },
      { reply: 'A perfect age for it. The **Aurora Family Week** fits February half-term: husky rides in the afternoon, an aurora hut with hot chocolate at night, and a guide who wakes you if the sky lights up.\n\n6 nights from €1,890 per adult and €1,150 per child, flights from London included.' },
      { link: { url: 'https://tundraandtide.example/trips/aurora-family-week', title: 'Aurora Family Week · Abisko', description: '6 nights · February and March · from €1,890' } },
    ],
  },
  blank: {
    host: { name: 'Your Stand-in', kind: 'standin', title: 'AI Stand-in' },
    turns: [
      { visitor: 'What can I ask here?' },
      { reply: 'Anything about this page. The conversation happens right here: no pop-up, no new window. When a person on the team joins, their name replaces mine in the header.', stream: true },
      { visitor: 'Can a person take over?' },
      { card: { cardType: 'handoff', repName: 'Sam Rivera', repTitle: 'Support' }, host: { name: 'Sam Rivera', title: 'Support', kind: 'rep' }, wait: 1000 },
      { reply: 'Hi, Sam here. I’ve read the conversation so far, so no need to repeat anything. How can I help?', think: 2000 },
    ],
  },
};
