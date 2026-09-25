import { describe, expect, it } from "vitest";

import {
    lifecycleBuilderFromDepartmentMetadata,
    serializeLifecycleBuilderV1,
    setStageRequirements,
    renameStage,
    updateStageDescription,
    activeLifecycleProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { parseStageRequirementsV1, serializeStageRequirementsV1 } from "@/lib/lifecycle/stageRequirementsV1";

/**
 * A Business Process requirement must survive edits to everything that is not it.
 *
 * The scenario this protects against actually happened: the Enrolling stage's requirement for
 * `Enrollment Paperwork 2026–2027` was present in the editable draft on 2026-09-11 and absent from
 * both draft and publication on 2026-09-14, with nothing reported to anyone.
 *
 * The mechanism is the combination of two individually reasonable decisions. Requirements are read
 * with a parser that SKIPS rows it cannot understand, and every writer persists the WHOLE
 * configuration document, serialized from what it just parsed. Skipping on read therefore became
 * deleting on write, for any save of any unrelated part of the process.
 */

const PACKET_ID = "c03425c9-2b05-4847-8495-2b2713e36243";

/** The packet requirement exactly as it is persisted. */
const packetRow = {
    requirement_id: "enrollment_packet",
    kind: "packet",
    packet_definition_id: PACKET_ID,
    level: "required",
    scope: "record",
    timing: "stage_exit",
    enforcement: "blocking",
};

const departmentMetadata = (requirements: unknown[]) => ({
    lifecycle_builder_v1: {
        version: 1,
        active_process_id: "proc_1",
        processes: [
            {
                id: "proc_1",
                key: "enrollment",
                name: "Enrollment",
                is_active: true,
                stages: [
                    {
                        id: "stage_1",
                        key: "enrolling",
                        label: "Enrolling",
                        sort_order: 1,
                        is_active: true,
                        requirements_v1: { version: 1, requirements },
                    },
                    { id: "stage_2", key: "enrolled", label: "Enrolled", sort_order: 2, is_active: true },
                ],
            },
        ],
    },
});

const requirementsAfterRoundTrip = (metadata: unknown) => {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    // What every writer does: serialize the parsed builder back over the whole document.
    const written = serializeLifecycleBuilderV1(builder);
    const reread = lifecycleBuilderFromDepartmentMetadata({ lifecycle_builder_v1: written });
    const stage = activeLifecycleProcess(reread)?.stages.find((s) => s.key === "enrolling");
    return stage?.requirements_v1?.requirements ?? [];
};

describe("a packet requirement survives the whole-document write", () => {
    it("is still there after a save that changed nothing about it", () => {
        const after = requirementsAfterRoundTrip(departmentMetadata([packetRow]));

        expect(after).toHaveLength(1);
        expect(after[0].ref).toEqual({ kind: "packet", packet_definition_id: PACKET_ID });
        expect(after[0].level).toBe("required");
        expect(after[0].enforcement).toBe("blocking");
    });

    it("survives renaming the stage it belongs to", () => {
        const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata([packetRow]));
        const edited = renameStage(builder, "proc_1", "stage_1", "Enrolling (renamed)");
        const after = requirementsAfterRoundTrip({ lifecycle_builder_v1: serializeLifecycleBuilderV1(edited) });

        expect(after).toHaveLength(1);
        expect(after[0].requirement_id).toBe("enrollment_packet");
    });

    it("survives editing an unrelated part of the same stage", () => {
        const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata([packetRow]));
        const edited = updateStageDescription(builder, "proc_1", "stage_1", "A new description");
        const after = requirementsAfterRoundTrip({ lifecycle_builder_v1: serializeLifecycleBuilderV1(edited) });

        expect(after).toHaveLength(1);
    });

    it("survives authoring requirements on a DIFFERENT stage", () => {
        const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata([packetRow]));
        const parsed = parseStageRequirementsV1({
            version: 1,
            requirements: [{ requirement_id: "r1", kind: "field", rule_id: "child:first_name", level: "required" }],
        });
        const edited = setStageRequirements(builder, "proc_1", "enrolled", parsed!);
        const after = requirementsAfterRoundTrip({ lifecycle_builder_v1: serializeLifecycleBuilderV1(edited) });

        expect(after).toHaveLength(1);
        expect(after[0].requirement_id).toBe("enrollment_packet");
    });
});

describe("a row this branch cannot read is preserved, not deleted", () => {
    /*
     * This is the defect itself. A requirement written in a shape this parser does not understand
     * was skipped on read — correctly — and therefore absent from the document the next save wrote,
     * which deleted it. Skipping a row must never mean destroying it.
     */
    const nestedRefRow = {
        requirement_id: "enrollment_packet",
        ref: { kind: "packet", packet_definition_id: PACKET_ID },
        level: "required",
        enforcement: "blocking",
    };

    it("is not honoured as a requirement", () => {
        const parsed = parseStageRequirementsV1({ version: 1, requirements: [nestedRefRow] });

        expect(parsed?.requirements).toHaveLength(0);
    });

    it("but is carried through serialization verbatim", () => {
        const parsed = parseStageRequirementsV1({ version: 1, requirements: [nestedRefRow] });
        const written = serializeStageRequirementsV1(parsed!);

        expect(written.requirements).toEqual([nestedRefRow]);
    });

    it("survives an unrelated save of the whole process", () => {
        const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata([nestedRefRow]));
        const edited = renameStage(builder, "proc_1", "stage_1", "Enrolling (renamed)");
        const written = serializeLifecycleBuilderV1(edited);

        expect(JSON.stringify(written)).toContain(PACKET_ID);
    });

    it("keeps readable rows first and does not disturb them", () => {
        const parsed = parseStageRequirementsV1({
            version: 1,
            requirements: [nestedRefRow, { requirement_id: "r1", kind: "field", rule_id: "child:first_name", level: "required" }],
        });
        const written = serializeStageRequirementsV1(parsed!) as { requirements: Record<string, unknown>[] };

        expect(written.requirements).toHaveLength(2);
        expect(written.requirements[0].requirement_id).toBe("r1");
        expect(written.requirements[1]).toEqual(nestedRefRow);
    });

    it("an authored replacement of that stage's section still wins", () => {
        // Preservation must not resurrect a row an author has deliberately replaced.
        const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata([nestedRefRow]));
        const replacement = parseStageRequirementsV1({ version: 1, requirements: [] })!;
        const edited = setStageRequirements(builder, "proc_1", "enrolling", replacement);
        const written = JSON.stringify(serializeLifecycleBuilderV1(edited));

        expect(written).not.toContain(PACKET_ID);
    });
});

describe("what a packet or form edit can reach", () => {
    it("a process requirement references the packet by id only", () => {
        // The ownership rule, asserted rather than assumed: the requirement carries a reference and
        // nothing else, so a packet's name, description, steps and order are not reachable from it.
        const parsed = parseStageRequirementsV1({ version: 1, requirements: [packetRow] });
        const ref = parsed!.requirements[0].ref as { kind: string; packet_definition_id: string };

        expect(ref).toEqual({ kind: "packet", packet_definition_id: PACKET_ID });
        expect(Object.keys(ref)).toEqual(["kind", "packet_definition_id"]);
    });

    it("changing the packet's composition cannot change the requirement", () => {
        // A packet edit writes `form_packet_items`/`form_packet_definitions`. The requirement lives
        // in the department's business-process document, which those writes never touch — so the
        // round-trip below is the whole surface a packet edit could affect, and it is unchanged.
        const before = serializeLifecycleBuilderV1(
            lifecycleBuilderFromDepartmentMetadata(departmentMetadata([packetRow])),
        );
        const after = serializeLifecycleBuilderV1(
            lifecycleBuilderFromDepartmentMetadata({ lifecycle_builder_v1: before }),
        );

        expect(after).toEqual(before);
    });
});

describe("configuration health tells draft and live apart", () => {
    /*
     * The previous failure mode was worse than a wrong answer: one honest red row saying no
     * paperwork was required, sitting beside three green ticks that had verified an empty list.
     */
    it("does not report green over an empty live configuration", async () => {
        const { participantPaperworkReadiness } = await import("@/lib/lifecycle/participantPaperworkReadiness");
        const rows = participantPaperworkReadiness({ requirements: [], forms: [] });

        expect(rows.find((r) => r.id === "participant_work_exists")?.pass).toBe(false);
        for (const id of ["required_forms_resolve", "required_forms_published", "upload_requests_classified", "signature_can_be_placed"]) {
            expect(rows.find((r) => r.id === id)?.summary).toMatch(/Nothing to check/);
        }
    });

    it("names a pending draft change without claiming it is live", async () => {
        const { participantPaperworkReadiness } = await import("@/lib/lifecycle/participantPaperworkReadiness");
        const rows = participantPaperworkReadiness({ requirements: [], forms: [], draftObligationCount: 3 });
        const row = rows.find((r) => r.id === "participant_work_exists")!;

        // Still not live, and says so first.
        expect(row.pass).toBe(false);
        expect(row.summary).toMatch(/LIVE configuration/);
        expect(row.summary).toMatch(/publish it to apply/i);
    });

    it("says nothing about a draft when the live configuration already requires paperwork", async () => {
        const { participantPaperworkReadiness } = await import("@/lib/lifecycle/participantPaperworkReadiness");
        const rows = participantPaperworkReadiness({
            requirements: [{ requirement_id: "r1", form_definition_id: "f1", level: "required" }],
            forms: [{ form_definition_id: "f1", name: "A form", exists: true, has_published_version: true, published_field_count: 1, uploads: [], signature_field_ids: [], signature_placement_field_ids: [], renders_source_document: false }],
            draftObligationCount: 3,
        });
        const row = rows.find((r) => r.id === "participant_work_exists")!;

        expect(row.pass).toBe(true);
        expect(row.summary).not.toMatch(/draft/i);
    });
});
