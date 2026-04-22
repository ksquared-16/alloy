import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

type LifecycleStageKey =
  | "intake"
  | "qualification"
  | "execution"
  | "decision"
  | "success"
  | "failure";

function lifecycleStageFromStatusDef(def: StatusDefinitionRow): LifecycleStageKey | null {
  const raw = (def.metadata as { lifecycle_stage?: unknown } | null)?.lifecycle_stage;
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;
  if (
    s === "intake" ||
    s === "qualification" ||
    s === "execution" ||
    s === "decision" ||
    s === "success" ||
    s === "failure"
  ) {
    return s;
  }
  return null;
}

export function terminalOpportunityStatusKeysFromDefs(defs: StatusDefinitionRow[]): Set<string> {
  const out = new Set<string>();
  for (const d of defs ?? []) {
    const key = String(d.status_key ?? "").trim().toLowerCase();
    if (!key) continue;
    const stage = lifecycleStageFromStatusDef(d);
    if (stage === "success" || stage === "failure") out.add(key);
  }
  return out;
}

/**
 * Execution-eligible = not terminal (success/failure) per status definition lifecycle semantics.
 * This is intentionally vertical-agnostic (no hardcoded "enrolled"/"lost").
 */
export function isOpportunityActiveForExecution(params: {
  statusKey: string | null | undefined;
  terminalStatusKeys: Set<string>;
}): boolean {
  const sk = String(params.statusKey ?? "").trim().toLowerCase();
  if (!sk) return true;
  return !params.terminalStatusKeys.has(sk);
}

