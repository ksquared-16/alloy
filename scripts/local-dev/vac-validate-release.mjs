#!/usr/bin/env node
/**
 * Release an S5 claim held by `alloy-validate`.
 *
 * Called from the broker's existing exit trap, so it runs on success, failure,
 * signal and cancellation alike. A claim that escapes even that is reaped on
 * the next ledger read, because its holder pid is gone.
 */
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { releaseCapacity, drainQueue } from "./lib/vacilando/validation-admission.mjs";
import { computeCapacityPolicy, hostCapability } from "./lib/vacilando/capacity-policy.mjs";
import { probeMemory, probeDisk, probeLoad } from "./lib/vacilando/health-probes.mjs";
import os from "node:os";

const [claimId, exitCode] = process.argv.slice(2);
if (!claimId) process.exit(0);
try { releaseCapacity(claimId, { exitCode: exitCode == null ? null : Number(exitCode) }); } catch { /* reaped on next read */ }

// The drain makes an ADMISSION decision for every waiter, so it needs the real
// memory snapshot. Passing `hostCapability({ os })` left memory unmeasured —
// which, now that an unmeasured host correctly constrains, would have refused
// to release ANY waiter and left every queued validation sitting until its
// deadline expired. `sampleMs: 0` skips the swap-delta second sample: the drain
// needs availability, not a rate, and must not add 700ms to every release.
try {
  const memory = await probeMemory({ os, sampleMs: 0 });
  const capacity = computeCapacityPolicy(hostCapability({ os, memory, disk: probeDisk({}), load: probeLoad({ os }) }));
  drainQueue({ capacity });
} catch { /* next acquire re-probes */ }
