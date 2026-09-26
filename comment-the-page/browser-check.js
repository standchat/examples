// Test-only Playwright CLI run-code function. Never loaded by the page.
// Open this example in an isolated browser session before running.
async (page) => {
  const browser = page.context().browser();
  const demoUrl = page.url();
  const results = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); results.push(message); };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await context.newPage(); p.setDefaultTimeout(5000);
  let creates = [], messageIds = [], failedMessage = false, socket;
  let canonical = [];
  let sessionStatus = 'active';
  let scenario = 'available';
  const errors = [];
  p.on('pageerror', error => errors.push(error.message));
  const message = (seq, senderType, body, type = 'text', extra = {}) => ({ messageId: `m${seq}`, seq, senderType, body, type, ...extra });
  const session = () => ({ sessionId: 'fixture', visitorToken: 'fixture-token', status: sessionStatus, participants: [{ isRep: false, userId: 'visitor' }], messages: canonical });
  await context.route('https://cdn.stand.chat/**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await context.route('**/_shared/**', route => route.fulfill({ body: '', contentType: route.request().url().endsWith('.css') ? 'text/css' : 'application/javascript' }));
  await context.route('https://api.stand.chat/**', async route => {
    const request = route.request(), url = { pathname: request.url().split('api.stand.chat')[1].split('?')[0] };
    const reply = (data, status = 200) => route.fulfill({ status, json: data });
    if (url.pathname === '/v1/reps/find') return reply(scenario === 'unavailable' ? { available: false } : { available: true, standinProfileId: 'fixture-ai', responderType: 'standin', repName: 'Fixture AI', sensitiveNoticeText: 'Fixture notice: no sensitive data.', poweredByUrl: 'https://stand.chat/' });
    if (url.pathname === '/v1/sessions' && request.method() === 'POST') {
      creates.push(request.postDataJSON());
      if (scenario === 'uncertain') return reply({}, 503);
      canonical = [message(1, 'visitor', request.postDataJSON().initialMessage), message(2, 'system-card', JSON.stringify({ cardType: 'session-start', standinName: 'Fixture AI' }), 'system-card'), message(3, 'system-prompt', 'PRIVATE-FIXTURE-CONTEXT', 'system-prompt'), message(4, 'standin', '<img src=x onerror=alert(1)> is literal text.'), message(5, 'standin', JSON.stringify({ url: 'javascript:alert(1)', title: 'unsafe' }), 'link-card'), message(6, 'standin', JSON.stringify({ url: 'https://stand.chat/guide', title: 'Safe guide' }), 'link-card')];
      return reply(session());
    }
    if (url.pathname.endsWith('/messages')) {
      const body = request.postDataJSON();
      messageIds.push(body.clientMessageId);
      if (!failedMessage) { failedMessage = true; return reply({}, 500); }
      const accepted = message(canonical.length + 1, 'visitor', body.body, 'text', { clientMessageId: body.clientMessageId });
      canonical.push(accepted);
      return reply(accepted);
    }
    if (url.pathname.endsWith('/followup-request')) { sessionStatus = 'ended'; return reply({}); }
    if (request.method() === 'DELETE') { sessionStatus = 'ended'; return reply({}); }
    if (url.pathname === '/v1/sessions/fixture') return reply(session());
    return reply({});
  });
  await p.routeWebSocket('wss://api.stand.chat/**', ws => { socket = ws; ws.send(JSON.stringify({ type: 'connected' })); });
  try {
    await p.goto(demoUrl);
    await p.locator('#layout').selectOption('split');
    await p.locator('[data-palette="pool"]').tap();
    await p.locator('#spacing').focus(); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
    await p.locator('#seats').fill('7');
    await p.locator('#billing').selectOption('annual');
    check(await p.locator('#total-price').innerText() === '$840 / year', 'Annual pricing responds to seven editors');
    check(await p.evaluate(() => document.documentElement.scrollWidth === innerWidth), '390px mobile page has no horizontal overflow without shared chrome');
    await p.locator('[data-jump="pricing"]').last().tap();
    await p.waitForFunction(() => document.querySelector('#thread-status').textContent.includes('Ready when'));
    check(creates.length === 0, 'Opening a target does not start a conversation');
    check((await p.locator('#context-text').textContent()).includes('$840 due per year'), 'Pricing snapshot includes current total and assumptions');
    await p.locator('#question').fill('What is included in this estimate?');
    await p.locator('#send').tap();
    await p.waitForFunction(() => document.querySelector('#thread-status').textContent.startsWith('Connected'));
    check(creates.length === 1 && creates[0].prompt.includes('7 editors, annual billing'), 'First send uses supported prompt with exact selected context');
    check((await p.locator('#messages').innerText()).includes('<img src=x'), 'Arbitrary HTML is rendered as literal text');
    check(await p.locator('#messages img').count() === 0, 'Message HTML does not create DOM elements');
    check(!(await p.locator('#messages').innerText()).includes('PRIVATE-FIXTURE'), 'Internal prompts remain hidden');
    check(await p.locator('#messages a').count() === 1, 'Only the safe HTTP(S) link card is rendered');
    check(await p.locator('#notice').isVisible(), 'Configured sensitive-data notice is preserved');
    await p.locator('#question').fill('Follow-up retry check');
    await p.locator('#send').tap();
    await p.locator('#retry-message').waitFor({ state: 'visible' });
    await p.locator('#retry-message').tap();
    await p.waitForFunction(() => document.querySelector('#retry-message').hidden);
    check(messageIds.length === 2 && messageIds[0] === messageIds[1], 'Retry reuses the original client message ID');
    await p.reload();
    await p.waitForFunction(() => document.querySelector('#thread-status').textContent.startsWith('Connected'));
    check(creates.length === 1, 'Reload recovers the session without creating another');
    check(await p.locator('#messages .visitor').count() === 2, 'Recovery preserves exactly two visitor messages');
    check(await p.locator('#total-price').innerText() === '$840 / year', 'Local pricing state survives reload');
    const handoff = message(8, 'system-card', JSON.stringify({ cardType: 'handoff', repName: 'Fixture Human', message: 'Handoff test event.' }), 'system-card');
    canonical.push(handoff); socket.send(JSON.stringify({ event: 'message', ...handoff }));
    await p.waitForFunction(() => document.querySelector('#host-kind').textContent === 'Human representative');
    check(await p.locator('#host-name').innerText() === 'Fixture Human', 'Server handoff changes identity and removes AI badge');
    const offer = message(9, 'system-card', JSON.stringify({ cardType: 'rep-followup-offer' }), 'system-card');
    canonical.push(offer); socket.send(JSON.stringify({ event: 'message', ...offer }));
    await p.locator('#email-form').waitFor({ state: 'visible' });
    await p.locator('#email').fill('fixture@example.com');
    await p.locator('#email-form button').tap();
    await p.waitForFunction(() => document.querySelector('#thread-status').textContent.includes('has ended'));
    check(await p.locator('#email-form').isHidden(), 'Genuine event-driven follow-up form closes after submission');
    check(errors.length === 0, 'No application exceptions in the integration fixture');

    await p.evaluate(() => sessionStorage.clear());
    scenario = 'unavailable';
    await p.reload();
    await p.locator('#comment-mode').tap();
    await p.locator('[data-select="design"]').tap();
    await p.waitForFunction(() => document.querySelector('#thread-status').textContent.includes('No responder'));
    await p.locator('#question').fill('Kept offline draft');
    check(await p.locator('#send').isDisabled(), 'Unavailable state retains drafts and disables sending');
    scenario = 'uncertain';
    await p.locator('#retry').tap();
    await p.waitForFunction(() => document.querySelector('#thread-status').textContent.includes('Ready when'));
    await p.locator('#send').tap();
    await p.waitForFunction(() => document.querySelector('#thread-status').textContent.includes('Start not confirmed'));
    const count = creates.length;
    await p.reload();
    await p.waitForFunction(() => document.querySelector('#thread-status').textContent.includes('Start not confirmed'));
    check(creates.length === count, 'Uncertain initial send is never automatically repeated on reload');
    check((await p.locator('#question').inputValue()).includes('Kept offline draft'), 'Uncertain start preserves editable question');
    await p.locator('#close-thread').tap();
    await p.setViewportSize({ width: 320, height: 780 });
    check(await p.evaluate(() => document.documentElement.scrollWidth === innerWidth), '320px mobile page has no horizontal overflow');
    await p.setViewportSize({ width: 1440, height: 1000 });
    check(await p.evaluate(() => document.documentElement.scrollWidth === innerWidth), '1440px desktop has no horizontal overflow');
    return { passed: results.length, checks: results };
  } catch(error) { throw new Error(JSON.stringify({ error: String(error), passed: results, state: await p.locator('#thread-status').textContent(), detail: await p.locator('#error').textContent(), count: creates.length, errors })); } finally { await context.close(); }
}
