/**
 * CLI helpers for node identity, durable backup/restore, and the Vacilando lane.
 */
import { ensureVacilandoSpecialistLane, listDurableLanes, publicDurableLane } from "../development-lane.mjs";
import {
  backupDurableState,
  restoreDurableState,
  verifyBackup,
} from "../durable-state.mjs";
import {
  ensureLocalNode,
  publicExecutionNode,
  vacilandoGatewayRoot,
} from "../execution-node.mjs";

export function cmdNode({ root, name } = {}) {
  const rec = ensureLocalNode({ root: root || vacilandoGatewayRoot(), name: name || null });
  return publicExecutionNode(rec);
}

export function cmdBackup({ sourceRoot, backupRoot } = {}) {
  return backupDurableState({
    sourceRoot: sourceRoot || vacilandoGatewayRoot(),
    backupRoot,
  });
}

export function cmdVerify({ backupPath } = {}) {
  return verifyBackup(backupPath);
}

export function cmdRestore({ backupPath, destRoot, invalidateBindings = true } = {}) {
  return restoreDurableState({ backupPath, destRoot, invalidateBindings });
}

export function cmdEnsureVacilandoLane({ root } = {}) {
  const r = root || vacilandoGatewayRoot();
  const out = ensureVacilandoSpecialistLane({ root: r });
  return {
    ok: out.ok,
    created: out.created,
    lane: publicDurableLane(out.lane),
    error: out.error || null,
  };
}

export function cmdLanes({ root } = {}) {
  return listDurableLanes(root || vacilandoGatewayRoot()).map(publicDurableLane);
}
