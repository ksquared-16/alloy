/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const BOARD = "components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx";
const raw = readFileSync(join(ROOT, BOARD), "utf8");

/**
 * Comments are blanked LINE-BY-LINE so line numbers survive. Every assertion below is about
 * what the component DOES, and the comment explaining why a write was removed necessarily
 * names the call it removed — reading prose as code would make this test permanently red.
 */
const src = raw
    .split("\n")
    .map((l) => (/^\s*(\/\/|\/\*|\*)/.test(l) ? "" : l.replace(/\/\/.*$/, "")))
    .join("\n");

/**
 * LIFECYCLE ACTIVATION — durable-write boundaries (R-007).
 *
 * Invariant: reading, selecting, expanding or navigating configuration must not cause a
 * durable server mutation. Only an explicit configuration-changing action may write.
 *
 * `selectStage` — the Stages-list click handler — used to end with
 * `void saveActivation({ stage_key, stage_label })`. That PATCHed the whole activation
 * bundle and the handler wrote `departments.metadata`, so clicking a stage to LOOK at it was
 * a durable write.
 *
 * The severity is not "it persisted a cursor". `activation.stage_key` is read by the RUNTIME
 * as a binding — `builderOwnedLifecycleRuntime`, `lifecycleWorkUnitQueueValidation`,
 * `lifecycleRuntimeBinding` and `validateLifecycleActivationRuntime` all branch on it — so
 * browsing the stage list silently repointed which stage the activation targets.
 *
 * This is a source-level ledger because the board is ~1800 lines with a deep async load
 * lifecycle; mounting it to assert "no request fired" would test the harness more than the
 * contract. The ledger states which functions may write and fails when a new one appears,
 * which is exactly the regression that happened.
 */

/** Every `saveActivation(` call site, with the function that encloses it. */
function callSites(): { line: number; fn: string; fireAndForget: boolean }[] {
    const lines = src.split("\n");
    const out: { line: number; fn: string; fireAndForget: boolean }[] = [];
    let fn = "<module>";
    lines.forEach((l, i) => {
        const m = /^ {4}const ([A-Za-z0-9_]+) = (?:useCallback|async|\()/.exec(l);
        if (m) fn = m[1]!;
        if (/^ {4}useEffect\(/.test(l)) fn = "useEffect";
        if (!l.includes("saveActivation(")) return;
        if (/const saveActivation/.test(l)) return;
        out.push({ line: i + 1, fn, fireAndForget: /\bvoid\s+saveActivation\(/.test(l) });
    });
    return out;
}

/**
 * Functions permitted to persist the activation bundle, and why each is a real mutation
 * boundary. Adding an entry here is a deliberate act; it should never happen for a handler
 * whose job is navigation or reading.
 */
const PERMITTED_WRITERS: Readonly<Record<string, string>> = {
    saveStageStatuses: "explicit save/apply — operator saves the stage's statuses",
    saveStageUnified: "explicit save/apply — the unified Save stage action",
    renameLifecycle: "explicit operator mutation — renaming the lifecycle",
    deleteWorkUnitQueue: "explicit operator mutation — removing the work-unit queue",
    clearStageStatuses: "explicit operator mutation — clearing the stage's statuses",
    handleLifecycleFormCreated: "initialization — first persist after the lifecycle is created",
};

/** Handlers that exist to move the operator around. None may write. */
const NAVIGATION_HANDLERS = ["selectStage"] as const;

describe("lifecycle activation — durable write boundaries", () => {
    it("only explicit mutation boundaries persist the activation bundle", () => {
        const writers = [...new Set(callSites().map((c) => c.fn))].sort();
        expect(writers).toEqual(Object.keys(PERMITTED_WRITERS).sort());
    });

    it("selecting a stage to read it does NOT write", () => {
        const offenders = callSites().filter((c) =>
            (NAVIGATION_HANDLERS as readonly string[]).includes(c.fn),
        );
        expect(
            offenders,
            "Stage selection must stay local. activation.stage_key is a RUNTIME binding, not "
                + "editor position — persisting it from a read gesture repoints the activation.",
        ).toEqual([]);
    });

    it("no activation write is fire-and-forget", () => {
        // `void saveActivation(...)` swallowed failures silently, so a rejected write left the
        // operator believing configuration had persisted.
        const silent = callSites().filter((c) => c.fireAndForget);
        expect(silent.map((c) => `${c.fn}:${c.line}`)).toEqual([]);
    });

    it("stage selection still updates local state", () => {
        // Removing the write must not remove the navigation itself.
        const body = src.slice(src.indexOf("const selectStage = useCallback"));
        const fnBody = body.slice(0, body.indexOf("\n    const renameLifecycle"));
        expect(fnBody).toContain("setStageKey(stage.key)");
        expect(fnBody).toContain("setStageLabel(stage.label)");
        expect(fnBody).toContain("stageKeyRef.current = stage.key");
        expect(fnBody).not.toContain("saveActivation");
    });

    it("the explicit save paths still persist stage identity", () => {
        // stage_key must still reach the server when the operator commits a real change,
        // otherwise the runtime binding could never be set at all.
        expect(src).toContain("stage_key: patch.stage_key ?? stageKey");
        const savers = callSites().filter((c) => c.fn.startsWith("save"));
        expect(savers.length).toBeGreaterThan(0);
    });
});
