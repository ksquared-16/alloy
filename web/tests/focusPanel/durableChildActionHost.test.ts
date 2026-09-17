import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildDurableChildOperationalContext } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import { resolveFocusPanelMutationOpportunityId } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import type { DurableChildStageWorkContextInput } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildStageWorkContextInput";

/**
 * A CARD THAT RENDERS AN EXECUTABLE ACTION MUST HAVE A HOST THAT CAN RUN IT.
 *
 * `BusinessProcessCard` runs its commands by asking the host to open the Current Work workspace,
 * through `coordination?.openCurrentWorkWorkspace?.(…)`. The durable child record passed no
 * coordination, so the call landed on undefined: `Send enrollment paperwork` rendered enabled and
 * the click produced no request, no panel, no composer and no error.
 */

const WEB = process.cwd();
const code = (rel: string) =>
    readFileSync(join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const CHILD = "aaaaaaaa-0000-4000-8000-00000000000a";
const OCM = "bbbbbbbb-0000-4000-8000-00000000000b";
const FAMILY = "cccccccc-0000-4000-8000-00000000000c";

const subject = (): DurableChildSubject => ({
    memberId: CHILD,
    personId: null,
    householdId: "hh-1",
    label: "Toureeb Tourb0913",
    dateOfBirth: null,
    householdName: "Tourb0913 Family",
    isActive: true,
    truth: { id: CHILD },
});

const stageWork = (over: Partial<DurableChildStageWorkContextInput> = {}): DurableChildStageWorkContextInput => ({
    processKey: "enrollment",
    stageKey: "enrolling",
    stageLabel: "Enrolling",
    opportunityCustomerMemberId: OCM,
    familyOpportunityId: FAMILY,
    stageWorkRuntime: null,
    publishedStageInputs: null,
    ...over,
});

describe("the action subject stays the child; the conversation belongs to the family", () => {
    it("keeps the child as the panel subject", () => {
        const ctx = buildDurableChildOperationalContext(subject(), true, null, stageWork());
        expect(ctx.subject.type).toBe("child");
        expect(ctx.subject.id).toBe(CHILD);
        expect(ctx.participantScope?.customerMemberId).toBe(CHILD);
    });

    it("derives the communication context from the family, under the key the platform already reads", () => {
        const ctx = buildDurableChildOperationalContext(subject(), true, null, stageWork());
        // The canonical resolver every communications/mutation path keys on.
        expect(
            resolveFocusPanelMutationOpportunityId({
                subjectId: ctx.subject.id,
                grain: ctx.grain,
                truth: ctx.truth as Record<string, unknown>,
            }),
        ).toBe(FAMILY);
    });

    it("never invents a family — no episode means the key is simply absent", () => {
        const ctx = buildDurableChildOperationalContext(
            subject(),
            true,
            null,
            stageWork({ familyOpportunityId: null }),
        );
        expect((ctx.truth as Record<string, unknown>)["child.family_opportunity_id"]).toBeUndefined();
    });

    it("the family id is resolved on the server, never accepted from the browser", () => {
        const composer = code(
            "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildStageWork.ts",
        );
        expect(composer).toContain("opportunity_customer_members");
        const route = code("app/api/admin/durable-record/route.ts");
        expect(route).toContain("familyOpportunityId: stageWork.opportunityId");
    });
});

describe("the durable record hosts the canonical coordination, not its own executor", () => {
    const card = code("components/presentation/durableRecord/DurableRecordContextualCard.tsx");

    it("uses the SAME hook the operational grid uses", () => {
        expect(card).toContain("useCurrentWorkWorkspaceCoordination(");
        const grid = code("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        expect(grid).toContain("useCurrentWorkWorkspaceCoordination(");
        // Lifted, not copied: the grid no longer owns the state inline.
        expect(grid).not.toContain("setCurrentWorkWorkspace({ open: true");
    });

    it("does not discard the family key the context builder merged in", () => {
        // Re-spreading the raw subject truth dropped `child.family_opportunity_id`, and the composer
        // opened with no family to thread the message on.
        expect(card).toContain("...base.truth,");
        expect(card).not.toContain("...childSubject.truth,\n                _scheduling_projection");
    });

    it("hands that coordination to the card renderer", () => {
        expect(card).toContain("coordination={coordination}");
    });

    it("builds no durable-record action executor", () => {
        for (const forbidden of ["executeCommandSurfaceAction", "actions/execute", "CurrentWorkActionPanel"]) {
            expect(card, `the durable host executes actions itself via ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("no second composer host was created for child-originated family communication", () => {
        for (const fork of [
            "components/admin/focusPanel/cards/ChildEnrollmentNewMessageComposerHost.tsx",
            "components/presentation/durableRecord/DurableChildComposerHost.tsx",
        ]) {
            let exists = true;
            try {
                readFileSync(join(WEB, fork), "utf8");
            } catch {
                exists = false;
            }
            expect(exists, `${fork} duplicates the Communications host`).toBe(false);
        }
    });
});

describe("an enabled action with no host is impossible", () => {
    const card = code("components/admin/focusPanel/cards/BusinessProcessCard.tsx");

    it("treats the host's own capability as part of executability", () => {
        expect(card).toContain("const canOpenWorkspace = typeof coordination?.openCurrentWorkWorkspace === \"function\"");
        expect(card).toContain("const hostless = !canOpenWorkspace && needsWorkspaceHost(command);");
        expect(card).toContain("disabled: hostless || command.status !== \"executable\"");
    });

    it("classifies with the same owner invoke switches on — never a second list", () => {
        expect(card).toContain("planCurrentWorkActionExecution(command.action).kind");
        // The two kinds that genuinely need no workspace.
        expect(card).toContain('kind !== "command_surface"');
    });

    it("uses the existing unavailable treatment rather than a new error system", () => {
        expect(card).toContain("disabledReason: hostless");
        expect(card).not.toMatch(/toast|alert\(|window\.alert|throw new Error\("This action/);
    });
});
