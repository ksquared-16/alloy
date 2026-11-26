/**
 * LAW — NO UNEXPLAINED PAGE REFRESH. Convergence is normal; refresh is exceptional.
 *
 * `applyRegistryResolvedActionClient` documents `router.refresh()` as LEGACY behaviour used only
 * when a host supplies no `invalidate`. That fallback is not theoretical: both operator command
 * rails omitted it, so every command run from a rail re-rendered the whole route while the SAME
 * command converged surgically from the record header. Same action, different surface, different
 * blast radius — and to the operator it reads as the page randomly refreshing.
 *
 * These are source-inspection guards. That is a blunt instrument, so each one states the exact
 * mechanism it protects, and the reload guard deliberately ignores comments — a file that merely
 * EXPLAINS why it no longer reloads must not fail.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");
/** Strip block and line comments so prose about reloading is not mistaken for reloading. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ACTION_HOSTS = [
    "components/presentation/rightRail/WorkspaceRightRailActions.tsx",
    "components/presentation/rightRail/WorkUnitRightRailActions.tsx",
    "lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmHeaderActions.ts",
];

/** Canonical operator surfaces. Legacy `/legacy-admin` routes are out of this contract. */
const CANONICAL_NO_RELOAD = [
    "components/presentation/workUnit/WaitlistPlacementAdjustControl.tsx",
    "components/presentation/rightRail/WorkspaceRightRailActions.tsx",
    "components/presentation/rightRail/WorkUnitRightRailActions.tsx",
];

describe("no unexplained page refresh", () => {
    it("every host of the shared action client supplies a canonical invalidate", () => {
        for (const f of ACTION_HOSTS) {
            expect(code(read(f)), `${f} must converge, not fall back to router.refresh()`).toMatch(/invalidate\s*:/);
        }
    });

    it("POSITIVE CONTROL — the fallback still exists in the action client", () => {
        // If this ever disappears the guard above is protecting nothing, and should be revisited
        // rather than left passing for the wrong reason.
        expect(read("lib/admin/actions/applyRegistryResolvedActionClient.ts")).toMatch(/router\.refresh\(\)/);
    });

    it("canonical operator surfaces never reload the document to show a mutation", () => {
        for (const f of CANONICAL_NO_RELOAD) {
            expect(code(read(f)), `${f} must not call location.reload()`).not.toMatch(/location\s*\.\s*reload\s*\(/);
        }
    });

    it("POSITIVE CONTROL — the comment-stripper does not hide a real reload", () => {
        const withComment = `/* we used to call window.location.reload() here */\nfoo();`;
        const withCall = `/* explanation */\nwindow.location.reload();`;
        expect(code(withComment)).not.toMatch(/location\s*\.\s*reload\s*\(/);
        expect(code(withCall)).toMatch(/location\s*\.\s*reload\s*\(/);
    });

    it("the waitlist adjust converges through a registered membership-changing key", () => {
        // A broadcast only makes listeners REFETCH when its action key is registered as
        // membership-changing; otherwise they patch rows they can see and counts stay stale.
        expect(code(read("components/presentation/workUnit/WaitlistPlacementAdjustControl.tsx")))
            .toMatch(/broadcastWorkspaceMutation\("placement_manual_order"\)/);
        expect(read("lib/admin/opportunityQueueRefreshEvent.ts")).toMatch(/"placement_manual_order"/);
    });
});
