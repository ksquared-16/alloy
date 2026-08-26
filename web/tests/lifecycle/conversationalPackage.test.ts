/**
 * A package is a courtesy to the parent, never a merge of facts.
 *
 * It owns no truth: N need ids and a prompt. Each need is still validated and applied on its own,
 * which is why two resolved and one ambiguous is an ordinary outcome rather than a failure.
 */
import { describe, it, expect } from "vitest";
import { packageOutstandingNeeds, MAX_PACKAGE_SIZE } from "@/lib/enrollment/participantRuntime/conversationalPackage";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

let n = 0;
const need = (over: {
    section?: string | null; entity?: string | null; type?: string; options?: string[];
    state?: string; action?: boolean; key?: string;
}): EnrollmentInformationNeed =>
    ({
        identity: { key: over.key ?? `k${++n}`, scope: "child", subject_id: "c1", canonical_key: null, shared_value_key: null, session_value_key: `process:d:f${n}`, entity_type: over.entity ?? "customer_member", field_key: null, basis: "unbound", artifact_specific: true, collection_mode: "conversational" },
        scope: "child", subject_id: "c1", state: over.state ?? "missing",
        occurrence_count: 1,
        occurrences: [{ requirement_id: "r", form_definition_id: "d", form_definition_version_id: "v", session_item_id: "s", form_field_id: `f${n}`, label: `L${n}`, required: true, field_type: over.type ?? "text", options: over.options ?? [], section_title: over.section === undefined ? "Health Information and Developmental History" : over.section }],
        requirement_ids: ["r"], has_value: false, current_value: null, value_source: "none",
        requires_participant_action: over.action ?? true,
    }) as unknown as EnrollmentInformationNeed;

describe("packaging groups on evidence the packet already carries", () => {
    it("packages related open-text needs from the same authored section", () => {
        const pkgs = packageOutstandingNeeds([need({}), need({}), need({})]);
        expect(pkgs).toHaveLength(1);
        expect(pkgs[0]!.need_keys).toHaveLength(3);
        expect(pkgs[0]!.section_title).toBe("Health Information and Developmental History");
        expect(pkgs[0]!.interaction).toBe("open_text");
    });

    it("never crosses the school's own section boundary", () => {
        const pkgs = packageOutstandingNeeds([need({ section: "Contact Information" }), need({ section: "Health Information and Developmental History" })]);
        expect(pkgs).toHaveLength(2);
    });

    it("never mixes subjects — one question about two people reads as neither", () => {
        const pkgs = packageOutstandingNeeds([need({ entity: "customer_member" }), need({ entity: "guardian" })]);
        expect(pkgs).toHaveLength(2);
        expect(pkgs[0]!.voice_key).toMatch(/^child:/);
        expect(pkgs[1]!.voice_key).toBe("responding_adult");
    });

    it("keeps a tapped answer out of a typed one", () => {
        const pkgs = packageOutstandingNeeds([need({ type: "text" }), need({ type: "date" })]);
        expect(pkgs).toHaveLength(2);
        expect(pkgs[1]!.interaction).toBe("deterministic");
    });

    it("asks a deterministic control on its own", () => {
        const pkgs = packageOutstandingNeeds([need({ type: "boolean" }), need({ type: "boolean" }), need({ type: "boolean" })]);
        expect(pkgs).toHaveLength(3);
        for (const p of pkgs) expect(p.need_keys).toHaveLength(1);
    });

    it("caps a package at a size a person can answer in one breath", () => {
        const pkgs = packageOutstandingNeeds(Array.from({ length: 9 }, () => need({})));
        expect(pkgs.every((p) => p.need_keys.length <= MAX_PACKAGE_SIZE)).toBe(true);
    });

    it("NEVER drops a need — every outstanding need appears in exactly one package", () => {
        // The failure mode this pins: trimming an over-large package silently loses questions.
        const needs = [
            ...Array.from({ length: 7 }, () => need({})),
            need({ type: "date" }), need({ type: "boolean" }),
            need({ section: "Contact Information", entity: "guardian" }),
        ];
        const pkgs = packageOutstandingNeeds(needs);
        const packaged = pkgs.flatMap((p) => p.need_keys);
        expect(new Set(packaged).size).toBe(packaged.length);
        expect(packaged.sort()).toEqual(needs.map((x) => x.identity.key).sort());
    });

    it("leaves settled needs out entirely", () => {
        const pkgs = packageOutstandingNeeds([need({ action: false, state: "known" }), need({})]);
        expect(pkgs).toHaveLength(1);
    });

    it("keeps confirmations as their own kind of turn", () => {
        const pkgs = packageOutstandingNeeds([need({ state: "known_requires_confirmation", action: false }), need({})]);
        expect(pkgs[0]!.interaction).toBe("confirmation");
        expect(pkgs).toHaveLength(2);
    });
});
