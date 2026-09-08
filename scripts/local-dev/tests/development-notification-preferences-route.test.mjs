#!/usr/bin/env node
/**
 * The phone switch has to be reachable, not merely implemented.
 *
 * THE DEFECT THIS PINS. The route was first written in the GET section of the
 * server, which sits below:
 *
 *     if (req.method !== "GET") return sendJson(res, 405, ...)
 *
 * So GET /api/notifications/preferences returned the preference correctly and
 * POST — the half that actually changes anything — answered
 * `method_not_allowed` from a gate the handler never got past. The switch
 * rendered, the operator moved it, the optimistic repaint showed the new state,
 * and it silently snapped back on the next read.
 *
 * Every unit test passed the whole time, because they exercised the preference
 * MODULE and never the routing. It was caught by driving the installed runtime
 * over HTTP. This suite asserts the wiring itself, so the module being correct
 * can never again be mistaken for the feature working.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SRC = readFileSync(new URL("../lib/vacilando-server.mjs", import.meta.url), "utf8");
const lineOf = (needle, from = 0) => {
  const idx = SRC.indexOf(needle, from);
  assert.notEqual(idx, -1, `not found: ${needle}`);
  return SRC.slice(0, idx).split("\n").length;
};

test("the write half is above the GET-only gate", () => {
  const gate = lineOf(`if (req.method !== "GET") return sendJson(res, 405`);
  const post = lineOf(`if (path === "/api/notifications/preferences") {`);
  assert.ok(post < gate,
    `POST handler at line ${post} must precede the GET-only gate at line ${gate}, or it is unreachable`);
});

test("the write half is inside the POST block, beside the other mutations", () => {
  const postBlock = lineOf(`    if (req.method === "POST") {`);
  const prefs = lineOf(`if (path === "/api/notifications/preferences") {`);
  const seen = lineOf(`if (path === "/api/notifications/seen") {`);
  assert.ok(postBlock < prefs, "preferences POST must be inside the POST block");
  // Sitting next to /api/notifications/seen is the point: they are the same
  // kind of thing, and the neighbour proves the placement is right.
  assert.ok(Math.abs(prefs - seen) < 80, "preferences POST belongs beside notifications/seen");
});

test("a read half still exists for GET", () => {
  const gate = lineOf(`if (req.method !== "GET") return sendJson(res, 405`);
  const getHalf = SRC.indexOf(`if (path === "/api/notifications/preferences") {`,
    SRC.indexOf(`if (req.method !== "GET") return sendJson(res, 405`));
  assert.notEqual(getHalf, -1, "GET must still be served after the gate");
  assert.ok(SRC.slice(0, getHalf).split("\n").length > gate);
});

test("the write half reads the body through the checked envelope", () => {
  // readJsonBody returns { ok, value } — reading `body.push_enabled` directly
  // is always undefined, which would reject every valid request as
  // push_enabled_required. The neighbouring routes use the envelope; this one
  // must too.
  const start = SRC.indexOf(`      if (path === "/api/notifications/preferences") {`);
  const block = SRC.slice(start, start + 1200);
  assert.match(block, /const body = await readJsonBody\(req\)/);
  assert.match(block, /if \(!body\.ok\)/);
  assert.match(block, /body\.value/);
  assert.doesNotMatch(block, /body\?\.push_enabled/,
    "must not read the field off the envelope itself");
});

test("a non-boolean is refused rather than coerced", () => {
  const start = SRC.indexOf(`      if (path === "/api/notifications/preferences") {`);
  const block = SRC.slice(start, start + 1400);
  // The switch is only applied when it was actually sent as a boolean, so
  // "false" the string, or 0, can never switch the operator's phone off — and
  // a categories-only request must not be read as "push_enabled: undefined".
  assert.match(block, /typeof value\.push_enabled === "boolean"/);
  assert.match(block, /if \(hasSwitch\) prefs\.setPushEnabled\(value\.push_enabled\)/);
});

test("a request that names neither the switch nor a category is refused", () => {
  const start = SRC.indexOf(`      if (path === "/api/notifications/preferences") {`);
  const block = SRC.slice(start, start + 1400);
  assert.match(block, /push_enabled_or_categories_required/);
});

test("categories and the master switch are independently settable", () => {
  // A categories-only POST must not clear the switch, and vice versa: they are
  // written through separate setters that each preserve the other.
  const start = SRC.indexOf(`      if (path === "/api/notifications/preferences") {`);
  const block = SRC.slice(start, start + 1400);
  assert.match(block, /if \(hasCats\) prefs\.setNotificationCategories\(value\.categories\)/);
});
