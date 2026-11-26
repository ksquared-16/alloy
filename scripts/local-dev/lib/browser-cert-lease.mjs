#!/usr/bin/env node
/**
 * Node helper for browser-certification lease (alloy-compute capacity 1).
 *
 * Capture / certification scripts should call withBrowserCertLease() before
 * launching Chromium. Does not invent a second permit store.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPUTE = join(HERE, "..", "alloy-compute");
const RESOURCE = "browser-certification";
const OVERRIDE = "i-accept-parallel-browser-certification";

function holderFromCwd() {
  if (process.env.ALLOY_BROWSER_CERT_HOLDER) return process.env.ALLOY_BROWSER_CERT_HOLDER;
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    return top.split("/").pop() || "unknown";
  } catch {
    return "unknown";
  }
}

export function browserCertOverrideActive() {
  return process.env.ALLOY_BROWSER_CERT_OVERRIDE === OVERRIDE;
}

export function acquireBrowserCertLease({ reason = "browser certification", wait = true, holder } = {}) {
  if (browserCertOverrideActive()) {
    process.stderr.write("! browser-cert override in effect — proceeding without exclusive lease\n");
    return { ok: true, overridden: true, holder: holder || holderFromCwd() };
  }
  const h = holder || holderFromCwd();
  const args = ["acquire", RESOURCE, "--holder", h, "--reason", reason];
  args.push(wait ? "--wait" : "--no-wait");
  try {
    execFileSync(COMPUTE, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ALLOY_COMPUTE_HOLDER_PID: String(process.pid) },
    });
    return { ok: true, overridden: false, holder: h };
  } catch (e) {
    const err = e.stderr?.toString?.() || e.message || String(e);
    return { ok: false, overridden: false, holder: h, error: err };
  }
}

export function releaseBrowserCertLease(holder) {
  if (browserCertOverrideActive()) return { ok: true };
  const h = holder || holderFromCwd();
  try {
    execFileSync(COMPUTE, ["release", RESOURCE, "--holder", h], { stdio: "ignore" });
  } catch {
    /* best-effort */
  }
  return { ok: true, holder: h };
}

/** Acquire, run fn, always release. Throws if acquire fails. */
export async function withBrowserCertLease(fn, opts = {}) {
  const acq = acquireBrowserCertLease(opts);
  if (!acq.ok) {
    const err = new Error(`browser-certification lease refused: ${acq.error || "at capacity"}`);
    err.code = "browser_cert_lease_refused";
    throw err;
  }
  try {
    return await fn();
  } finally {
    releaseBrowserCertLease(acq.holder);
  }
}
