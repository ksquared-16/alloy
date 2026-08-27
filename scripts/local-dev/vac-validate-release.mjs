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
import os from "node:os";

const [claimId, exitCode] = process.argv.slice(2);
if (!claimId) process.exit(0);
try { releaseCapacity(claimId, { exitCode: exitCode == null ? null : Number(exitCode) }); } catch { /* reaped on next read */ }
try { drainQueue({ capacity: computeCapacityPolicy(hostCapability({ os })) }); } catch { /* next acquire re-probes */ }
