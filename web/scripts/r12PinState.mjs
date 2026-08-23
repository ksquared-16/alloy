/** R12 — read the canonical pin/override state the runtime actually computed, from the RSC payload. */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path"; import fs from "fs";
const BASE = process.env.R12_BASE ?? "http://127.0.0.1:3012";
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ storageState: join(homedir(), ".local/state/alloy-dev/auth/slot2/storage-state.json"), viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  const blobs = [];
  p.on("response", async (r) => {
    try { const t = await r.text(); if (/active_override_kinds|runtime_position/.test(t)) blobs.push({ url: r.url().replace(BASE, ""), t }); } catch {}
  });
  await p.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForFunction(() => document.querySelectorAll("[data-queue-row-waitlist-rank-cluster]").length > 0, undefined, { timeout: 90000 });
  await p.waitForTimeout(8000);
  fs.mkdirSync("/tmp/r12", { recursive: true });
  console.log("payloads containing placement state:", blobs.length);
  const all = blobs.map((x) => x.t).join("\n");
  fs.writeFileSync("/tmp/r12/rsc-raw.txt", all);
  // Pull each candidate's name + position + override kinds out of the flight payload.
  const names = [...all.matchAll(/child_display_name\\?":\\?"([^"\\]{1,40})/g)].map((m) => m[1]);
  console.log("candidate names seen:", [...new Set(names)].join(", ") || "(none)");
  const kinds = [...all.matchAll(/active_override_kinds\\?":\s*\\?\[([^\]]*)\]/g)].map((m) => m[1]);
  console.log("active_override_kinds occurrences:", kinds.length);
  const nonEmpty = kinds.filter((k) => k.replace(/[\\"\s]/g, "").length > 0);
  console.log("NON-EMPTY override kinds:", nonEmpty.length, nonEmpty.slice(0, 10));
  const positions = [...all.matchAll(/runtime_position\\?":\s*(\d+)/g)].map((m) => m[1]);
  console.log("runtime_position values:", positions.join(", "));
  const notes = [...all.matchAll(/runtime_position_precedence_note\\?":\\?"([^"\\]{0,120})/g)].map((m) => m[1]);
  console.log("precedence notes present:", notes.length, notes);
  const modes = [...new Set([...all.matchAll(/runtime_position_mode\\?":\\?"(\w+)/g)].map((m) => m[1]))];
  console.log("runtime_position_mode values:", modes.join(", "));
  const shadow = [...new Set([...all.matchAll(/shadow_mode\\?":\s*(true|false)/g)].map((m) => m[1]))];
  console.log("shadow_mode values:", shadow.join(", "));
} finally { await b.close(); }
