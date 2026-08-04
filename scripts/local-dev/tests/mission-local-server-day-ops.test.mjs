/**
 * Mission local-server resolution + day-ops smoke.
 */
import assert from "node:assert/strict";
import { missionLocalServerVm } from "../lib/vacilando/mission-local-server.mjs";
import { dayOpsVm } from "../lib/vacilando/day-ops.mjs";

const day = dayOpsVm();
assert.equal(day.kind, "day_ops");
assert.ok(day.actions?.startDay?.label);
assert.ok(day.actions?.stopDay?.label);

const mid = "msn_f74ed02c126c88d7ff";
const vm = missionLocalServerVm(mid);
assert.equal(vm.kind, "mission_local_server");
assert.ok(vm.worktree, "mission should resolve a worktree from session cwd");
assert.ok(vm.port);
assert.ok(vm.actions?.start || vm.actions?.stop || vm.actions?.open,
  "at least one server action should be available when worktree resolves");

console.log(JSON.stringify({
  ok: true,
  worktree: vm.worktree,
  port: vm.port,
  status: vm.status,
  start: Boolean(vm.actions?.start),
  day_actions: true,
}, null, 2));
