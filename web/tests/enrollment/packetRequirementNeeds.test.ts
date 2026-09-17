import { describe, expect, it, vi } from "vitest";

import { expandPacketStageRequirements } from "@/lib/enrollment/participantProgress/expandPacketStageRequirements";
import { projectRequirementsProgress } from "@/lib/enrollment/participantProgress/projectEnrollmentParticipantProgress";
import { requirementIdForForm } from "@/lib/lifecycle/compilePacketToStageRequirements";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { validateFormSchema } from "@/lib/forms/schema";

/**
 * A STAGE THAT REQUIRES A PACKET REQUIRES THE FORMS INSIDE IT.
 *
 * Enrollment's Enrolling stage declares one requirement — `{kind: "packet"}` — and the needs
 * projection only ever accepted `kind: "form"`. So a journey-anchored participant had zero actionable
 * requirements, enumerated no forms, and a FRESH session against an 80-field form with 65 required
 * answers opened saying "Everything we need is complete."
 *
 * Measured on the live wire model before the repair:
 *   work { total: 0, settled: 0, remaining: 0, percent: 100 }, complete: true
 *   progress { total: 1, satisfied: 0, remaining: 1 }
 * The objective knew a step was outstanding and had no questions to ask for it.
 *
 * The same packet launched BY HAND was always fine, because the packet-anchored progress resolver
 * expands its steps into one form requirement each. That asymmetry was the defect.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const PACKET = "c03425c9-2b05-4847-8495-2b2713e36243";
const ADMISSIONS = "7d80ff71-2ae4-43f6-bd4d-0b8022e28f7d";
const HANDBOOK = "7d80ff71-2ae4-43f6-bd4d-0b8022e28f7e";
const CHILD = "cccc0000-0000-4000-8000-00000000000a";

function supabaseWithPacketItems(
    rows: Array<{ packet_definition_id: string; sequence_index: number; form_definition_id: string | null }>,
    opts: { error?: boolean } = {},
) {
    return {
        from() {
            const b: Record<string, unknown> = {};
            b.select = () => b;
            b.eq = () => b;
            b.in = () => Promise.resolve(opts.error ? { data: null, error: { message: "boom" } } : { data: rows, error: null });
            return b;
        },
    } as never;
}

const packetRequirement = (over: Record<string, unknown> = {}) =>
    ({
        requirement_id: "enrollment_packet",
        ref: { kind: "packet", packet_definition_id: PACKET },
        level: "required",
        scope: "record",
        timing: "stage_exit",
        enforcement: "blocking",
        ...over,
    }) as never;

describe("a packet requirement is read as the forms it contains", () => {
    it("expands to one form requirement per step, in packet order", async () => {
        const out = await expandPacketStageRequirements(
            supabaseWithPacketItems([
                { packet_definition_id: PACKET, sequence_index: 0, form_definition_id: ADMISSIONS },
                { packet_definition_id: PACKET, sequence_index: 1, form_definition_id: HANDBOOK },
            ]),
            { orgId: ORG, requirements: [packetRequirement()] },
        );
        expect(out.map((r) => (r.ref as { form_definition_id?: string }).form_definition_id)).toEqual([
            ADMISSIONS,
            HANDBOOK,
        ]);
        expect(out.every((r) => r.ref.kind === "form")).toBe(true);
    });

    it("uses the SAME requirement identity a hand-launched packet produces", async () => {
        // A packet chosen for a stage and the same packet launched by hand must describe the same
        // obligation, not two that look alike.
        const out = await expandPacketStageRequirements(
            supabaseWithPacketItems([
                { packet_definition_id: PACKET, sequence_index: 0, form_definition_id: ADMISSIONS },
            ]),
            { orgId: ORG, requirements: [packetRequirement()] },
        );
        expect(out[0]?.requirement_id).toBe(requirementIdForForm(ADMISSIONS));
    });

    it("the expanded forms become EVALUABLE, which the packet requirement never was", () => {
        // The real defect in one line: a packet projected `unsupported`, and an unsupported
        // requirement produces no question.
        const asPacket = projectRequirementsProgress([packetRequirement()], []);
        expect(asPacket[0]?.status).toBe("unsupported");
    });

    it("one form in two packets is one requirement", async () => {
        const OTHER = "99999999-0000-4000-8000-000000000099";
        const out = await expandPacketStageRequirements(
            supabaseWithPacketItems([
                { packet_definition_id: PACKET, sequence_index: 0, form_definition_id: ADMISSIONS },
                { packet_definition_id: OTHER, sequence_index: 0, form_definition_id: ADMISSIONS },
            ]),
            {
                orgId: ORG,
                requirements: [
                    packetRequirement(),
                    packetRequirement({ ref: { kind: "packet", packet_definition_id: OTHER } }),
                ],
            },
        );
        expect(out.filter((r) => r.ref.kind === "form")).toHaveLength(1);
    });

    it("an unreadable packet keeps its requirement rather than vanishing from the denominator", async () => {
        const failed = await expandPacketStageRequirements(supabaseWithPacketItems([], { error: true }), {
            orgId: ORG,
            requirements: [packetRequirement()],
        });
        expect(failed).toHaveLength(1);
        expect(failed[0]?.ref.kind).toBe("packet");
    });

    it("a form the stage declared directly is never displaced by the packet expansion", async () => {
        const declared = {
            requirement_id: "declared_admissions",
            ref: { kind: "form", form_definition_id: ADMISSIONS },
            level: "required",
            scope: "record",
            timing: "stage_exit",
            enforcement: "blocking",
        } as never;
        const out = await expandPacketStageRequirements(
            supabaseWithPacketItems([
                { packet_definition_id: PACKET, sequence_index: 0, form_definition_id: ADMISSIONS },
            ]),
            { orgId: ORG, requirements: [declared, packetRequirement()] },
        );
        const admissions = out.filter(
            (r) => (r.ref as { form_definition_id?: string }).form_definition_id === ADMISSIONS,
        );
        expect(admissions).toHaveLength(1);
        expect(admissions[0]?.requirement_id).toBe("declared_admissions");
    });
});

describe("the expansion is wired into the journey path, not merely available", () => {
    it("the journey progress resolver expands before it projects", () => {
        // The isolated cases above stay green when the call site is deleted, so they cannot prove
        // reachability on their own. The live objective is the other half of this proof.
        const src = readSourceOf("lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress.ts");
        expect(src).toContain("await expandPacketStageRequirements(supabase, {");
        // …and that what it projects is the expanded set, never the declared one.
        expect(src).toContain("projectRequirementsProgress(requirements, realized)");
        expect(src).not.toContain("projectRequirementsProgress(declared, realized)");
    });
});

function readSourceOf(rel: string): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    return readFileSync(join(process.cwd(), rel), "utf8");
}

function readSource(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    return readFileSync(
        join(process.cwd(), "lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds.ts"),
        "utf8",
    );
}

/*
 * ── THE SHAPE THE DEFECT WAS REPORTED AS ──
 *
 * A required question stays participant work even when it has no canonical Alloy destination.
 * "Form-only" says where the answer is retained, never that it is optional or unasked.
 */

const field = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    label: `Question ${id}`,
    required: true,
    type: "text" as const,
    ...over,
});

const canonicalField = (id: string, key: string) =>
    field(id, { field_source: { entity_type: "customer_member", field_key: key } });

function schemaOf(fields: unknown[]) {
    // The real published shape, through the platform's own validator, so a fixture cannot drift from
    // what a version actually stores. It throws on an invalid fixture rather than returning a result.
    return validateFormSchema({
        schema_version: 1,
        title: "Fixture",
        sections: [{ id: "s1", field_ids: (fields as { id: string }[]).map((f) => f.id) }],
        fields,
    });
}

const formOf = (fields: unknown[]) => ({
    requirement_id: requirementIdForForm(ADMISSIONS),
    form_definition_id: ADMISSIONS,
    form_definition_version_id: "bdd0ce8e-cc66-4725-b254-8084334328ab",
    session_item_id: "8ddf05da-a09a-4fde-9db2-5aabb0cbffd7",
    schema: schemaOf(fields),
});

describe("a required Form-only question is participant work", () => {
    /*
     * A  required + canonical + already known
     * B  required + Form-only
     * C  optional + Form-only
     * D  required + canonical + missing
     *
     * This half of the brief's hypothesis — that the runtime treated only canonically bound fields as
     * conversational needs — is DISPROVEN by these cases, and they stay as the guard that keeps it
     * disproven. Form-only says where the answer is retained, never that it is optional or unasked.
     */
    const fields = [
        canonicalField("A", "first_name"),
        field("B"),
        field("C", { required: false }),
        canonicalField("D", "dob"),
    ];

    const project = (canonicalValues: Record<string, unknown>) =>
        projectEnrollmentInformationNeeds({
            forms: [formOf(fields)],
            subjectId: CHILD,
            sharedValues: {},
            canonicalValues,
            confirmations: {},
        } as never);

    const fieldIdsOf = (needs: ReturnType<typeof project>) =>
        needs.flatMap((n) => n.occurrences.map((o) => o.form_field_id));

    it("every required question becomes a need, canonical or not", () => {
        const needs = project({});
        const asked = fieldIdsOf(needs.filter((n) => n.state === "missing"));
        expect(asked).toContain("B");
        expect(asked).toContain("D");
    });

    it("known canonical facts do not hide unrelated Form-only needs", () => {
        // The exact shape of the live defect as it was reported: the connected facts were known, and
        // the Form-owned questions were suspected of vanishing with them.
        const needs = project({ "customer_member:first_name": "Toureeb" });
        const asked = fieldIdsOf(needs.filter((n) => n.state === "missing"));
        expect(asked).toContain("B");
        expect(asked).toContain("D");
        // …and the known fact is still represented, not simply dropped.
        expect(fieldIdsOf(needs)).toContain("A");
    });

    it("a required Form-only question needs no canonical destination to be asked", () => {
        const bNeed = project({}).find((n) => n.occurrences.some((o) => o.form_field_id === "B"));
        expect(bNeed, "the Form-only required question produced no need").toBeTruthy();
        expect(bNeed?.identity.canonical_key ?? null).toBeNull();
        expect(bNeed?.optional ?? false).toBe(false);
    });

    it("an optional Form-only question is surfaced but never blocking", () => {
        const cNeed = project({}).find((n) => n.occurrences.some((o) => o.form_field_id === "C"));
        expect(cNeed?.optional).toBe(true);
    });
});
