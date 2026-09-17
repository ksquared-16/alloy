import { describe, expect, it, vi } from "vitest";

import { expandPacketRequirementsToForms } from "@/lib/enrollment/informationNeeds/expandPacketRequirementsToForms";
import { resolveEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds";
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
        kind: "packet",
        artifact: { kind: "packet", id: PACKET },
        level: "required",
        status: "outstanding",
        ...over,
    }) as never;

describe("a packet requirement becomes the forms it contains", () => {
    it("expands to one form requirement per step, in packet order", async () => {
        const out = await expandPacketRequirementsToForms(
            supabaseWithPacketItems([
                { packet_definition_id: PACKET, sequence_index: 0, form_definition_id: ADMISSIONS },
                { packet_definition_id: PACKET, sequence_index: 1, form_definition_id: HANDBOOK },
            ]),
            { orgId: ORG, requirements: [packetRequirement()] },
        );
        expect(out.map((r) => r.artifact.id)).toEqual([ADMISSIONS, HANDBOOK]);
        expect(out.every((r) => r.kind === "form")).toBe(true);
    });

    it("uses the SAME requirement identity a hand-launched packet produces", async () => {
        // A packet chosen for a stage and the same packet launched by hand must describe the same
        // obligation, not two that look alike.
        const out = await expandPacketRequirementsToForms(
            supabaseWithPacketItems([
                { packet_definition_id: PACKET, sequence_index: 0, form_definition_id: ADMISSIONS },
            ]),
            { orgId: ORG, requirements: [packetRequirement()] },
        );
        expect(out[0]?.requirement_id).toBe(requirementIdForForm(ADMISSIONS));
    });

    it("carries the packet requirement's status and level to its forms", async () => {
        const out = await expandPacketRequirementsToForms(
            supabaseWithPacketItems([
                { packet_definition_id: PACKET, sequence_index: 0, form_definition_id: ADMISSIONS },
            ]),
            { orgId: ORG, requirements: [packetRequirement({ status: "satisfied", level: "recommended" })] },
        );
        expect(out[0]?.status).toBe("satisfied");
        expect(out[0]?.level).toBe("recommended");
    });

    it("one form in two packets is one requirement", async () => {
        const OTHER = "99999999-0000-4000-8000-000000000099";
        const out = await expandPacketRequirementsToForms(
            supabaseWithPacketItems([
                { packet_definition_id: PACKET, sequence_index: 0, form_definition_id: ADMISSIONS },
                { packet_definition_id: OTHER, sequence_index: 0, form_definition_id: ADMISSIONS },
            ]),
            {
                orgId: ORG,
                requirements: [packetRequirement(), packetRequirement({ artifact: { kind: "packet", id: OTHER } })],
            },
        );
        expect(out).toHaveLength(1);
    });

    it("a non-form step adds no question, and an unreadable packet yields nothing", async () => {
        // A document to read or send in is a real obligation with no schema to ask about.
        const nonForm = await expandPacketRequirementsToForms(
            supabaseWithPacketItems([
                { packet_definition_id: PACKET, sequence_index: 0, form_definition_id: null },
            ]),
            { orgId: ORG, requirements: [packetRequirement()] },
        );
        expect(nonForm).toEqual([]);
        // A short list is recoverable; an error because one row was unreadable is not.
        const failed = await expandPacketRequirementsToForms(supabaseWithPacketItems([], { error: true }), {
            orgId: ORG,
            requirements: [packetRequirement()],
        });
        expect(failed).toEqual([]);
    });

    it("the resolver prefers a directly declared form over the same form via a packet", () => {
        const src = readSource();
        expect(src).toContain("declaredFormIds");
        expect(src).toContain("expandedFromPackets.filter((r) => !declaredFormIds.has(r.artifact.id))");
    });
});

/*
 * ── THE PROOF THAT THE EXPANSION IS ACTUALLY WIRED IN ──
 *
 * The cases above prove the expansion works in isolation, which a source guard cannot turn into
 * reachability: removing the call site leaves every one of them green. This drives the real resolver
 * with the real shape of the live session — a journey whose stage requires a PACKET, one realized
 * Admissions item, one pinned version — and asserts the participant is given questions.
 */
describe("a journey whose stage requires a packet is given questions to answer", () => {
    const VERSION = "bdd0ce8e-cc66-4725-b254-8084334328ab";
    const SESSION = "8ddf05da-a09a-4fde-9db2-5aabb0cbffd7";
    const ITEM = "session-item-1";

    const admissionsSchema = schemaOf([
        canonicalField("field_6", "first_name"),
        field("field_20"),
        field("field_21"),
    ]);

    function supabaseForResolver() {
        return {
            from(table: string) {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.order = () => b;
                b.maybeSingle = () => Promise.resolve({ data: null, error: null });
                b.in = () =>
                    Promise.resolve(
                        table === "form_definition_versions"
                            ? {
                                  data: [
                                      {
                                          id: VERSION,
                                          form_definition_id: ADMISSIONS,
                                          schema_json: admissionsSchema,
                                          pdf_mapping_json: null,
                                      },
                                  ],
                                  error: null,
                              }
                            : table === "form_packet_items"
                              ? {
                                    data: [
                                        {
                                            packet_definition_id: PACKET,
                                            sequence_index: 0,
                                            form_definition_id: ADMISSIONS,
                                        },
                                    ],
                                    error: null,
                                }
                              : { data: [], error: null },
                    );
                return b;
            },
        } as never;
    }

    const resolve = () =>
        resolveEnrollmentInformationNeeds(supabaseForResolver(), {
            orgId: ORG,
            processInstanceId: "d1011483-b8b5-42ed-8941-882c81839186",
            progress: {
                ok: true,
                value: {
                    process_instance_id: "d1011483-b8b5-42ed-8941-882c81839186",
                    session_id: SESSION,
                    // Exactly what the Enrolling stage declares: one packet requirement.
                    requirements: [packetRequirement()],
                },
            },
            preloaded: {
                session: { id: SESSION, shared_values: {}, metadata: {} },
                items: [
                    { id: ITEM, packet_item_id: "pi-1", resolved_form_definition_version_id: VERSION },
                ],
                formBySessionItem: new Map([[ITEM, ADMISSIONS]]),
                subjectId: CHILD,
            },
        } as never);

    it("enumerates the packet's forms instead of reporting nothing to do", async () => {
        const out = await resolve();
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        // The live defect was zero: no needs at all, and therefore "Everything we need is complete."
        expect(out.value.needs.length).toBeGreaterThan(0);
        const asked = out.value.needs.flatMap((n) => n.occurrences.map((o) => o.form_field_id));
        expect(asked).toContain("field_20");
        expect(asked).toContain("field_21");
    });

    it("the needs carry the packet-derived requirement identity", async () => {
        const out = await resolve();
        if (!out.ok) return;
        const ids = [...new Set(out.value.needs.flatMap((n) => n.requirement_ids))];
        expect(ids).toContain(requirementIdForForm(ADMISSIONS));
    });
});

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
