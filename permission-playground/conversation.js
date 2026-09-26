import { StandVisitorClient } from './stand-visitor.js';

export const CONTEXT_MARKER = '\n\n--- Rowhaven sandbox context ---\n';
export const SESSION_PROMPT = 'This is Rowhaven, a fictional database and authentication platform demo. The visitor is exploring a local, illustrative project-permission sandbox. Discuss the supplied scenario and question. Policy results come only from explicit deterministic controls. Replies do not change the page, validate security rules, or execute code. Do not claim to deploy policies, authenticate the selected identity, or operate a real Rowhaven backend. Distinguish suggestions from tested production authorization. The shared demo responder is Stand Chat’s AI Stand-in; do not pretend to represent a real Rowhaven team.';

export function contextualMessage(question, scenario) {
  // A recovered first-start draft can already contain a snapshot. Replace that
  // attachment on a deliberate resend; never duplicate or grow it recursively.
  const text = String(question).split(CONTEXT_MARKER)[0].trim();
  return text ? `${text}${CONTEXT_MARKER}${JSON.stringify(scenario, null, 2)}` : '';
}

export class ScenarioClient extends StandVisitorClient {
  constructor(options, getScenario) {
    super(options);
    this.getScenario = getScenario;
  }
  send(message = '', context = {}) {
    // Preserve the original pending body and idempotency ID on retry, even if
    // the visitor has changed identities or policies since the failed send.
    if (this.getSnapshot().pending) return super.send('', context);
    return super.send(contextualMessage(message, this.getScenario()), { ...context, prompt: SESSION_PROMPT });
  }
}
