/**
 * @vitest-environment jsdom
 */
/**
 * OX J5 — THE PROGRESSIVE PATCH REACHES THE TRUTH BAG THE RESERVED CELLS READ.
 *
 * A producer with no reader is the failure mode this programme has already shipped once: a carrier
 * keyed on the participation lens reached production unreadable by the panel that asserts no lens.
 * So this does not assert that a patch was published, or that a store holds it. It renders the real
 * `OperationalSubjectProvider` and reads the context a consumer actually receives.
 *
 * The load-bearing assertion is that `subjectIdentityTruth` — the bag
 * `focusPanelWorkModeModelFromProvisioningAnswer` spreads into `context.truth` — contains the
 * canonical roster after a patch lands, with NO drawer view model involved. Route the patch only
 * into the drawer-record lifecycle, or drop the merge, and these go red.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
    OperationalSubjectProvider,
    useOperationalSubject,
} from "@/components/presentation/workUnit/OperationalSubjectContext";
import {
    clearActionableDrawerCarriersForTests,
    publishDrawerTruthPatch,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrierStore";
import {
    DRAWER_TRUTH_PATCH_VERSION,
    type DrawerTruthPatch,
} from "@/lib/adminV2/viewModel/drawer/opportunity/drawerTruthPatch";
import type { SubjectIdentityTruth } from "@/lib/adminV2/runtime/operationalContext/types";

const patchFor = (opportunityId: string, fields: Record<string, unknown>): DrawerTruthPatch => ({
    version: DRAWER_TRUTH_PATCH_VERSION,
    subject: { opportunity_id: opportunityId, attention_subject_id: null },
    fields,
});

function TruthProbe() {
    const op = useOperationalSubject();
    const truth = (op.subjectIdentityTruth ?? null) as Record<string, unknown> | null;
    const roster = truth?._inquiry_children;
    return (
        <div
            data-roster={Array.isArray(roster) ? String(roster.length) : roster === undefined ? "absent" : "null"}
            data-contact={truth?.["person.primary_contact_name"] == null ? "absent" : "present"}
        />
    );
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const mount = (subjectId: string, seed: SubjectIdentityTruth | null) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
        root!.render(
            createElement(
                OperationalSubjectProvider,
                { subjectId, subjectIdentityTruth: seed, children: createElement(TruthProbe) } as never,
            ),
        );
    });
    return { container: host };
};

beforeEach(() => clearActionableDrawerCarriersForTests());
afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = null;
    host = null;
});

describe("progressive truth reaches the commit-critical bag", () => {
    it("is ABSENT before any patch — UNKNOWN, never coerced to empty", () => {
        const { container } = mount("opp-1", null);
        expect(container.querySelector("[data-roster]")?.getAttribute("data-roster")).toBe("absent");
    });

    it("a populated roster patch lands in subjectIdentityTruth with no drawer VM", () => {
        const { container } = mount("opp-1", null);
        act(() => publishDrawerTruthPatch(patchFor("opp-1", { _inquiry_children: [{ id: "c1" }, { id: "c2" }] })));
        expect(
            container.querySelector("[data-roster]")?.getAttribute("data-roster"),
            "the bag the reserved cells read must receive the canonical roster",
        ).toBe("2");
    });

    it("an explicit EMPTY roster is delivered as known-empty, not as absence", () => {
        const { container } = mount("opp-1", null);
        act(() => publishDrawerTruthPatch(patchFor("opp-1", { _inquiry_children: [] })));
        expect(container.querySelector("[data-roster]")?.getAttribute("data-roster")).toBe("0");
    });

    it("a patch for ANOTHER subject cannot mutate this one — latest click wins", () => {
        const { container } = mount("opp-C", null);
        act(() => publishDrawerTruthPatch(patchFor("opp-B", { _inquiry_children: [{ id: "c1" }] })));
        expect(
            container.querySelector("[data-roster]")?.getAttribute("data-roster"),
            "a late B patch must not reach C",
        ).toBe("absent");
    });

    it("the patch never invents contact truth the server did not send", () => {
        const { container } = mount("opp-1", null);
        act(() => publishDrawerTruthPatch(patchFor("opp-1", { _inquiry_children: [{ id: "c1" }] })));
        expect(
            container.querySelector("[data-contact]")?.getAttribute("data-contact"),
            "delivering a roster must not fabricate a contact name",
        ).toBe("absent");
    });

    it("answer truth already present survives the patch — KNOWN never regresses", () => {
        const seed = { "customer.id": "cust-1" } as unknown as SubjectIdentityTruth;
        const { container } = mount("opp-1", seed);
        act(() => publishDrawerTruthPatch(patchFor("opp-1", { _inquiry_children: [{ id: "c1" }] })));
        expect(container.querySelector("[data-roster]")?.getAttribute("data-roster")).toBe("1");
    });

    it("a second patch ADDS to the first rather than replacing the set", () => {
        const { container } = mount("opp-1", null);
        act(() => publishDrawerTruthPatch(patchFor("opp-1", { some_other_fact: "x" })));
        act(() => publishDrawerTruthPatch(patchFor("opp-1", { _inquiry_children: [{ id: "c1" }] })));
        expect(container.querySelector("[data-roster]")?.getAttribute("data-roster")).toBe("1");
    });
});
