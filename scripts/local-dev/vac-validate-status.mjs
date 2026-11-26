#!/usr/bin/env node
/**
 * What S5 currently holds, for `alloy-validate status`.
 *
 * One report from one owner. The previous status printed the state of a mutex
 * that no longer exists, which after convergence would have read "(idle)" while
 * governed work was running.
 */
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { readClaimStore, heldWeight } from "./lib/vacilando/validation-admission.mjs";
import { computeCapacityPolicy, hostCapability } from "./lib/vacilando/capacity-policy.mjs";
import os from "node:os";

const store = readClaimStore({});
const capacity = computeCapacityPolicy(hostCapability({ os }));
const budget = capacity.axes.validation_capacity.tokens;
const held = heldWeight(store);

process.stdout.write(`budget ${held}/${budget} tokens · workers <= ${capacity.axes.validation_capacity.worker_ceiling} · policy ${capacity.policy_version}\n`);
if (!store.claims.length) process.stdout.write("(no governed validation running)\n");
for (const c of store.claims) {
  process.stdout.write(`  ${c.claim_id} ${c.workload_class} weight=${c.exclusive ? "exclusive" : c.weight} pid=${c.pid} lane=${c.lane_id || "-"} workers=${c.workers_granted ?? "default"}\n`);
}
if (store.queue?.length) {
  process.stdout.write(`queued (${store.queue.length}):\n`);
  for (const q of store.queue) {
    process.stdout.write(`  ${q.request_id} ${q.workload_class} blocked_by=${(q.blocked_by || []).map((b) => b.axis).join(",")}\n`);
  }
}
if (store.reaped?.length) process.stdout.write(`reaped ${store.reaped.length} dead claim(s) on read\n`);
