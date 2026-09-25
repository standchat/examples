// The Stand Chat part of this example. (app.js is the pretend print-farm app.)
//
// 1. Stand's floating chat button is hidden; the app has its own entry points.
// 2. Those entry points appear only once Stand has someone who can answer:
//    a person on the team or an AI Stand-in.
// 3. Opening chat sends who is asking (identify) and, from contextual buttons,
//    a greeting plus private context about what they are looking at.

const user = { id: 'usr_4821', name: 'Maya Chen' }; // From your app's session.

function connectSupport(stand) {
  stand.initiallyHideChatButton();

  // Page-known identity for new conversations. Reps see the name; the ID stays
  // private. It is unverified metadata, never authentication.
  stand.identify({ externalId: user.id, name: user.name });

  // Show the entry points only while someone can answer.
  stand.whenAvailable(() => {
    for (const el of document.querySelectorAll('[data-support], [data-support-prompt]')) {
      el.hidden = false;
    }
  });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-support], [data-support-prompt]');
    if (!trigger) return;
    stand.openChat(trigger.dataset.supportGreeting ?? '', {
      // Context for your team and the AI Stand-in. Not shown to the user, but
      // it is in the page, so never put secrets here.
      prompt: trigger.dataset.supportPrompt ?? '',
      analyticsId: trigger.dataset.supportId ?? '',
    });
  });
}

// stand.js is deferred and can be blocked, so wait for its API.
(function waitForStand(tries = 0) {
  if (window.StandChat) return connectSupport(window.StandChat);
  if (tries < 200) setTimeout(() => waitForStand(tries + 1), 50);
})();
