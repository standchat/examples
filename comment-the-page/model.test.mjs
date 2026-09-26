import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDesign,
  estimatePlan,
  designCSS,
  targetContext,
  conversationPrompt,
  safeUrl,
} from "./model.js";

test("editor estimates use annual upfront billing and bounded whole seats", () => {
  assert.deepEqual(estimatePlan(4, "monthly"), {
    editors: 4,
    billing: "monthly",
    monthly: 48,
    due: 48,
  });
  assert.deepEqual(estimatePlan(4, "annual"), {
    editors: 4,
    billing: "annual",
    monthly: 40,
    due: 480,
  });
  assert.equal(estimatePlan(0, "annual").due, 120);
  assert.equal(estimatePlan(1000, "monthly").due, 600);
  assert.equal(estimatePlan(2.7, "monthly").editors, 3);
  assert.equal(estimatePlan("invalid", "other").due, 12);
});

test("design state is bounded and emitted CSS matches the specimen", () => {
  assert.deepEqual(
    normalizeDesign({ palette: "__proto__", layout: "other", spacing: -5 }),
    { palette: "citrus", layout: "poster", spacing: 16 },
  );
  assert.equal(normalizeDesign({ spacing: 100 }).spacing, 48);
  const css = designCSS({ palette: "iris", layout: "split", spacing: 32 });
  assert.match(css, /padding: 32px/);
  assert.match(css, /--accent: #6a51d3/);
  assert.match(css, /--layout: split/);
});

test("context captures the exact target, point, scenario and assumptions", () => {
  const design = { palette: "pool", layout: "split", spacing: 32 };
  const plan = estimatePlan(7, "annual");
  const context = targetContext("design", design, plan, { x: 0.4, y: 0.65 });
  assert.match(context, /Pool palette, split layout, 32px/);
  assert.match(context, /40% across, 65% down/);
  assert.match(context, /fictional creative workshop/);
  const pricing = targetContext("pricing", design, plan);
  assert.match(
    pricing,
    /7 editors, annual billing, \$70\/month equivalent, \$840 due per year/,
  );
  assert.match(pricing, /no taxes, add-ons, prorating/);
  assert.match(
    targetContext("claim", design, plan),
    /not implemented services/,
  );
  assert.throws(() => targetContext("other", design, plan));
  assert.ok(conversationPrompt(context).length <= 2000);
  assert.match(conversationPrompt(context), /not a fictional teammate/);
});

test("outbound URLs exclude script and data schemes", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,hello"), null);
  assert.equal(safeUrl("/relative"), null);
  assert.equal(safeUrl("https://stand.chat/guide"), "https://stand.chat/guide");
});
