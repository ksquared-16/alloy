#!/usr/bin/env node
/**
 * Tailscale extra-bind: discover live IP, never 0.0.0.0, retry EADDRNOTAVAIL.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

const {
  detectTailscaleIPv4,
  shouldRetryTailscaleBind,
  tailscaleRetryDelayMs,
  attachTailscaleListener,
  TAILSCALE_CLI_CANDIDATES,
} = await import("../lib/vacilando/vacilando-tailscale-bind.mjs");
const { assertPrivateBindHost } = await import("../lib/vacilando/vacilando-api-auth.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

await test("never allows 0.0.0.0", () => {
  assert.equal(assertPrivateBindHost("0.0.0.0").ok, false);
  assert.equal(assertPrivateBindHost("::").ok, false);
});

await test("CLI candidates include Tailscale.app, not a hardcoded CGNAT IP", () => {
  assert.ok(TAILSCALE_CLI_CANDIDATES.includes("/usr/local/bin/tailscale"));
  assert.ok(TAILSCALE_CLI_CANDIDATES.includes("/Applications/Tailscale.app/Contents/MacOS/Tailscale"));
  assert.equal(TAILSCALE_CLI_CANDIDATES.some((c) => /^100\./.test(c)), false);
});

await test("detect walks candidates and accepts only Tailscale CGNAT", () => {
  const calls = [];
  const ip = detectTailscaleIPv4({
    execFileSync: (bin, args) => {
      calls.push([bin, args.join(" ")]);
      if (bin === "tailscale") throw new Error("ENOENT");
      if (bin === "/usr/local/bin/tailscale") return "8.8.8.8\n";
      return "100.106.88.73\n";
    },
  });
  assert.equal(ip, "100.106.88.73");
  assert.ok(calls.length >= 3);
});

await test("detect ignores a stale non-tailscale address", () => {
  const ip = detectTailscaleIPv4({
    execFileSync: () => "192.168.1.9\n",
  });
  assert.equal(ip, null);
});

await test("EADDRNOTAVAIL is retried; EADDRINUSE is not", () => {
  assert.equal(shouldRetryTailscaleBind({ code: "EADDRNOTAVAIL" }), true);
  assert.equal(shouldRetryTailscaleBind({ message: "listen EADDRNOTAVAIL: address not available 100.1.2.3:3020" }), true);
  assert.equal(shouldRetryTailscaleBind({ code: "EADDRINUSE" }), false);
});

await test("retry delay backs off instead of spinning", () => {
  assert.equal(tailscaleRetryDelayMs(0), 250);
  assert.ok(tailscaleRetryDelayMs(6) >= 10000);
  assert.equal(tailscaleRetryDelayMs(99), tailscaleRetryDelayMs(6));
});

await test("attach retries after EADDRNOTAVAIL then binds the live IP", async () => {
  const server = new EventEmitter();
  const listens = [];
  let failFirst = true;
  const timers = [];
  const fakeCreate = () => {
    const extra = new EventEmitter();
    extra.close = () => {};
    extra.listen = (port, host, cb) => {
      listens.push({ port, host });
      if (failFirst) {
        failFirst = false;
        queueMicrotask(() => extra.emit("error", Object.assign(new Error("listen EADDRNOTAVAIL"), { code: "EADDRNOTAVAIL" })));
        return extra;
      }
      queueMicrotask(() => cb());
      return extra;
    };
    return extra;
  };
  const attached = attachTailscaleListener({
    server,
    port: 3020,
    createHttpServer: fakeCreate,
    detect: () => "100.106.88.73",
    delayMs: () => 1,
    setTimer: (fn, ms) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    },
    log() {},
    logOut() {},
  });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(listens.length, 2);
  assert.deepEqual(listens[0], { port: 3020, host: "100.106.88.73" });
  assert.deepEqual(listens[1], { port: 3020, host: "100.106.88.73" });
  assert.equal(attached.host, "100.106.88.73");
  attached.close();
  for (const id of timers) clearTimeout(id);
});

await test("attach refuses to listen on 0.0.0.0 even if detect lies", () => {
  const listens = [];
  const attached = attachTailscaleListener({
    server: new EventEmitter(),
    port: 3020,
    createHttpServer: () => ({
      once() {},
      listen(port, host) { listens.push({ port, host }); },
      close() {},
    }),
    detect: () => "0.0.0.0",
    log() {},
    logOut() {},
  });
  assert.equal(listens.length, 0);
  attached.close();
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
