/**
 * Choosing a packet must author exactly the five certified requirements — and nothing that lets the
 * packet keep talking to Business Process afterwards.
 *
 * The compile is the bridge that was missing. Its risk is not that it fails; it is that it succeeds
 * too well and quietly becomes a subscription, so a Studio edit reaches into a published revision.
 * These controls pin both halves: the output is right, and nothing points back.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import path from "node:path";
import { compilePacketToStageRequirements, requirementIdForForm } from "@/lib/lifecycle/compilePacketToStageRequirements";
import { parseStageRequirementsV1, isAuthorableRequirementKind } from "@/lib/lifecycle/stageRequirementsV1";
import StagePaperworkCard from "@/components/adminV2/settings/lifecycle/StagePaperworkCard";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

const CARD = readFileSync(
    resolve(__dirname, "../../components/adminV2/settings/lifecycle/StagePaperworkCard.tsx"),
    "utf8",
);

/** The certified packet's five items, in certified order. */
const CERTIFIED = [
    "17bc2de8-0f83-48a6-aabc-bcd72725bce8",
    "9a86ec71-e589-41d8-bd09-617dfe23d0d8",
    "5eb82c56-9459-42d9-a17d-725f2f6b0b19",
    "3f682c60-6e7c-4b41-a3cb-64f35c1a6d94",
    "34a5ced4-ecc3-41ae-8dc5-9f54bd29694b",
];
const ITEMS = CERTIFIED.map((form_definition_id, sequence_index) => ({ sequence_index, form_definition_id }));

describe("the compile output", () => {
    it("produces exactly the five certified form requirements in certified order", () => {
        const out = compilePacketToStageRequirements(ITEMS);
        expect(out).toHaveLength(5);
        expect(out.map((r) => r.form_definition_id)).toEqual(CERTIFIED);
        for (const r of out) {
            expect(r.kind).toBe("form");
            expect(r.level).toBe("required");
            expect(r.scope).toBe("record");
            expect(r.timing).toBe("stage_exit");
            expect(r.enforcement).toBe("blocking");
        }
    });

    it("orders by the packet's sequence, not by the order rows arrive", () => {
        const shuffled = [ITEMS[3]!, ITEMS[0]!, ITEMS[4]!, ITEMS[1]!, ITEMS[2]!];
        expect(compilePacketToStageRequirements(shuffled).map((r) => r.form_definition_id)).toEqual(CERTIFIED);
    });

    it("is accepted by the canonical action without dropping a row", () => {
        // The route compares counts precisely because the parser skips what it cannot read.
        const out = compilePacketToStageRequirements(ITEMS);
        const parsed = parseStageRequirementsV1({ version: 1, requirements: out })!;
        expect(parsed.requirements).toHaveLength(out.length);
        expect(parsed.requirements.every((r) => isAuthorableRequirementKind(r.ref.kind))).toBe(true);
        expect(parsed.requirements.map((r) => (r.ref as { form_definition_id: string }).form_definition_id)).toEqual(CERTIFIED);
    });

    it("collapses a form that appears twice in a packet into one requirement", () => {
        const dupe = [...ITEMS, { sequence_index: 9, form_definition_id: CERTIFIED[0]! }];
        const out = compilePacketToStageRequirements(dupe);
        expect(out).toHaveLength(5);
        expect(new Set(out.map((r) => r.requirement_id)).size).toBe(5);
    });

    it("is stable — recompiling the same packet yields the same identities", () => {
        const a = compilePacketToStageRequirements(ITEMS);
        const b = compilePacketToStageRequirements(ITEMS);
        expect(a.map((r) => r.requirement_id)).toEqual(b.map((r) => r.requirement_id));
        expect(a[0]!.requirement_id).toBe(requirementIdForForm(CERTIFIED[0]!));
    });
});

describe("the packet must not become an authority", () => {
    it("stores no packet id, key or reference on the requirement", () => {
        // If any packet identifier reached BP, a later Studio edit would have something to reach
        // through — which is exactly the live link the doctrine forbids.
        for (const r of compilePacketToStageRequirements(ITEMS)) {
            expect(Object.keys(r).sort()).toEqual(
                ["enforcement", "form_definition_id", "kind", "level", "requirement_id", "scope", "timing"],
            );
        }
    });

    it("compiles once at authoring time and never subscribes", () => {
        // The card reads the packet inside the choose handler only, and saves through the canonical
        // action. No effect re-reads it, and nothing persists which packet was used.
        expect(CARD).toContain("compilePacketToStageRequirements");
        expect(CARD).toContain('action: "set_stage_requirements"');
        expect(CARD).not.toContain("packet_definition_id:");
        expect(CARD).not.toContain("packet_id");
    });

    it("says out loud that a later packet edit changes nothing here", () => {
        const html = renderToStaticMarkup(
            <StagePaperworkCard
                departmentId="d1"
                stageKey="enrolling"
                stageRecord={{ id: "s1", key: "enrolling", label: "Enrolling", sort_order: 0, is_active: true } as LifecycleBuilderStageRecord}
                process={{ id: "p1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity", sort_order: 0, is_active: true, stages: [] } as LifecycleBuilderProcessRecord}
            />,
        );
        expect(html).toContain("Enrollment paperwork");
        expect(html).toContain("No paperwork chosen yet");
        expect(html).toContain("Choose paperwork");
    });
});

describe("the compact surface reads as the director's sentence", () => {
    const stageWith = (n: number) =>
        ({
            id: "s1", key: "enrolling", label: "Enrolling", sort_order: 0, is_active: true,
            requirements_v1: parseStageRequirementsV1({
                version: 1,
                requirements: compilePacketToStageRequirements(ITEMS.slice(0, n)),
            })!,
        }) as LifecycleBuilderStageRecord;
    const PROCESS = { id: "p1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity", sort_order: 0, is_active: true, stages: [] } as LifecycleBuilderProcessRecord;
    const render = (stage: LifecycleBuilderStageRecord) =>
        renderToStaticMarkup(<StagePaperworkCard departmentId="d1" stageKey="enrolling" stageRecord={stage} process={PROCESS} />);

    it("counts the forms rather than exposing requirement rows", () => {
        const html = render(stageWith(5));
        expect(html).toContain("5 forms required");
        expect(html).not.toContain("stage_exit");
        expect(html).not.toContain("scope");
    });

    it("distinguishes an authored no-paperwork decision from an unconfigured stage", () => {
        const empty = {
            id: "s1", key: "enrolling", label: "Enrolling", sort_order: 0, is_active: true,
            requirements_v1: parseStageRequirementsV1({ version: 1, requirements: [] })!,
        } as LifecycleBuilderStageRecord;
        expect(render(empty)).toContain("No paperwork required — an authored decision");
    });

    it("uses the established Configuration Mode buttons, not a new dark treatment", () => {
        expect(CARD).toContain("config-secondary-btn");
        expect(CARD).not.toContain("bg-alloy-midnight");
    });
});

describe("the enforcement claim stays truthful", () => {
    /**
     * The five requirements are authored `blocking` because that is their intended configuration.
     * They do not block anything yet: `evaluateTransitionRequirementPreflight` reads field rule ids
     * and does not read `requirements_v1`. A surface that says "blocking" with nothing beside it
     * describes behaviour the platform does not have, and an operator would reasonably rely on it.
     *
     * The rule this pins: state what is CONFIGURED, disclose what is not yet ENFORCED, and never
     * close the gap by marking a requirement satisfied.
     */
    const EDITOR = readFileSync(
        resolve(__dirname, "../../components/adminV2/settings/lifecycle/StageFormRequirementsEditor.tsx"),
        "utf8",
    );

    it("discloses pending enforcement wherever paperwork is summarised", () => {
        const html = renderToStaticMarkup(
            <StagePaperworkCard
                departmentId="d1"
                stageKey="enrolling"
                stageRecord={{
                    id: "s1", key: "enrolling", label: "Enrolling", sort_order: 0, is_active: true,
                    requirements_v1: parseStageRequirementsV1({ version: 1, requirements: compilePacketToStageRequirements(ITEMS) })!,
                } as LifecycleBuilderStageRecord}
                process={{ id: "p1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity", sort_order: 0, is_active: true, stages: [] } as LifecycleBuilderProcessRecord}
            />,
        );
        expect(html).toContain("Configured blocking; transition enforcement pending");
    });

    it("says nothing about enforcement when no paperwork is configured", () => {
        const html = renderToStaticMarkup(
            <StagePaperworkCard
                departmentId="d1"
                stageKey="enrolling"
                stageRecord={{ id: "s1", key: "enrolling", label: "Enrolling", sort_order: 0, is_active: true } as LifecycleBuilderStageRecord}
                process={{ id: "p1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity", sort_order: 0, is_active: true, stages: [] } as LifecycleBuilderProcessRecord}
            />,
        );
        expect(html).not.toContain("transition enforcement pending");
    });

    it("discloses it on the advanced rows too, only where blocking is chosen", () => {
        expect(EDITOR).toContain('row.enforcement === "blocking" ?');
        expect(EDITOR).toContain("configured blocking; transition enforcement pending");
    });

    it("never offers a way to mark a requirement satisfied", () => {
        // The forbidden shortcut: simulating enforcement by manufacturing satisfaction.
        for (const src of [EDITOR, CARD]) {
            expect(src).not.toContain("satisfied");
            expect(src).not.toContain("form_submissions");
        }
    });
});
