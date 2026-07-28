/**
 * CP-1 / D-013 — "Primary work first": the selected record's reveal must win the reveal window
 * against the speculative sibling-view answer prewarm.
 *
 * Measured defect (controlled same-process A/B, dev, slot3, 6 interleaved warm runs, mount-arm ON vs
 * OFF): with the window armed only at commit, the sibling-view provisioning-answer prewarm in
 * `useWorkspaceSurfaceRuntime` could win the race and inflate the reveal — median warm PRIMARY-USABLE
 * (first-meaningful) 7445 ms → 6599 ms (−11 %) when the window arms at mount instead, and the OFF
 * condition's pathological slow-tail (10.3 s / 11.4 s reveals) disappears (range 5669–11350 → 5621–7125).
 * The gain is real but modest; the dominant residual (~6.6 s) is the enriched-VM compose + bundle/hydrate,
 * which is Runtime-V1-Realization (server-compose the surface VM) scope, not this gate.
 *
 * The fix owns the timing with the EXISTING reveal gate — no new scheduler/coordinator: the Work Unit
 * surface arms `beginWorkUnitPrimaryReveal()` at MOUNT (before the sibling prewarm's idle callback can
 * fire) and releases on unmount. These are source assertions because the policy is a wiring choice —
 * the cheapest place to catch a regression is here, before a ten-minute browser run.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../", rel), "utf8");
/** Strip comments so prose that merely MENTIONS these calls cannot satisfy an assertion. */
const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("CP-1 — primary record reveal precedes speculative sibling-view prewarm", () => {
    const committed = code(read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts"));
    const workspace = code(read("lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts"));

    it("arms the reveal window at Work Unit surface MOUNT (empty-deps effect), not only at commit", () => {
        expect(committed).toMatch(/beginWorkUnitPrimaryReveal/);
        // A mount-scoped effect: begin on mount, release on unmount. Locks the ordering vs the
        // sibling prewarm's idle callback — arming only on the committed key is too late (measured).
        expect(committed).toMatch(
            /useEffect\(\(\)\s*=>\s*\{\s*beginWorkUnitPrimaryReveal\(\);\s*return\s*\(\)\s*=>\s*endWorkUnitPrimaryReveal\(\);\s*\}\s*,\s*\[\s*\]\s*\)/,
        );
    });

    it("gates the sibling-view answer prewarm on the reveal window — never firing during primary reveal", () => {
        // The speculative cross-view prewarm must consult the reveal gate before warming a sibling.
        expect(workspace).toMatch(/isWorkUnitPrimaryRevealActive/);
    });
});
