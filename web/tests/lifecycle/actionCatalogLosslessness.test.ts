import { describe, expect, it } from "vitest";

import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
    renameStage,
    serializeLifecycleBuilderV1,
    updateStageDescription,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    parseStageActionCatalogV1,
    serializeStageActionCatalogV1,
} from "@/lib/lifecycle/stageActionCatalogV1";

/**
 * The failure this reproduces actually shipped.
 *
 * Revision 32 of the certification tenant's Enrollment process went live having silently REMOVED
 * `work_template_key: "offer_spot"` from the Waitlist `stage_work.start` candidate action. Nobody
 * edited Waitlist. The change that carried it was a save of an unrelated stage's description, made
 * from a build that predated the field.
 *
 * Mechanism, identical to the requirement-loss defect closed earlier: these parsers are allowlist
 * reconstructors, every writer persists the WHOLE document serialized from what it just parsed, so
 * a field the reader did not own was gone. `preserveUnknownFields` exists precisely for this — the
 * action catalog simply was not using it.
 */

const OFFER_SPOT = {
    action_key: "stage_work.start",
    recommendation: "ready",
    work_template_key: "offer_spot",
};

/** A field no reader on this branch owns — stands in for whatever a newer writer adds next. */
const FROM_THE_FUTURE = {
    action_key: "some.future_action",
    recommendation: "ready",
    future_only_field: { nested: ["shape", 1, true] },
};

const metadata = (candidateActions: unknown[]) => ({
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
                        id: "stage_wl",
                        key: "waitlist",
                        label: "Waitlist",
                        sort_order: 1,
                        is_active: true,
                        action_catalog_v1: { version: 1, candidate_actions: candidateActions },
                    },
                    { id: "stage_en", key: "enrolling", label: "Enrolling", sort_order: 2, is_active: true },
                ],
            },
        ],
    },
});

/** Exactly what an unrelated save does: read the whole document, change one thing, write it all back. */
const afterUnrelatedSave = (candidateActions: unknown[]) => {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata(candidateActions));
    const edited = updateStageDescription(builder, "proc_1", "stage_en", "Enrolled and attending.");
    const written = serializeLifecycleBuilderV1(edited);
    const stage = (written.processes as Record<string, unknown>[])[0].stages as Record<string, unknown>[];
    const waitlist = stage.find((s) => s.key === "waitlist")!;
    return (waitlist.action_catalog_v1 as { candidate_actions: Record<string, unknown>[] }).candidate_actions;
};

describe("the Waitlist offer_spot key survives an unrelated save", () => {
    it("is still bound after a save about a different stage", () => {
        const rows = afterUnrelatedSave([OFFER_SPOT]);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ action_key: "stage_work.start", work_template_key: "offer_spot" });
    });

    it("survives renaming an unrelated stage", () => {
        const builder = lifecycleBuilderFromDepartmentMetadata(metadata([OFFER_SPOT]));
        const written = JSON.stringify(serializeLifecycleBuilderV1(renameStage(builder, "proc_1", "stage_en", "Enrolling (renamed)")));

        expect(written).toContain("offer_spot");
    });

    it("survives a full round trip through the catalog parser alone", () => {
        const parsed = parseStageActionCatalogV1({ version: 1, candidate_actions: [OFFER_SPOT] });
        const written = serializeStageActionCatalogV1(parsed!) as { candidate_actions: Record<string, unknown>[] };

        expect(written.candidate_actions[0]).toEqual(OFFER_SPOT);
    });
});

describe("fields and rows this branch does not understand", () => {
    it("an unknown FIELD on a known row survives a save", () => {
        const rows = afterUnrelatedSave([{ ...OFFER_SPOT, future_only_field: "keep me" }]);

        expect(rows[0].future_only_field).toBe("keep me");
        expect(rows[0].work_template_key).toBe("offer_spot");
    });

    it("an entire unreadable ROW survives a save, without becoming executable", () => {
        // No `action_key`, so this branch cannot read it — and must not lose it either.
        const rows = afterUnrelatedSave([OFFER_SPOT, { recommendation: "ready", something_new: true }]);

        expect(rows).toHaveLength(2);
        expect(rows).toContainEqual({ recommendation: "ready", something_new: true });

        // It is carried, not obeyed: nothing surfaced it as a candidate action.
        const parsed = parseStageActionCatalogV1({
            version: 1,
            candidate_actions: [{ recommendation: "ready", something_new: true }],
        });
        expect(parsed?.candidate_actions).toHaveLength(0);
    });

    it("a row with an unknown field is still readable, and keeps both halves", () => {
        const rows = afterUnrelatedSave([FROM_THE_FUTURE]);

        expect(rows[0].action_key).toBe("some.future_action");
        expect(rows[0].future_only_field).toEqual({ nested: ["shape", 1, true] });
    });

    it("unknown keys on the CATALOG itself survive", () => {
        const builder = lifecycleBuilderFromDepartmentMetadata({
            lifecycle_builder_v1: {
                ...metadata([OFFER_SPOT]).lifecycle_builder_v1,
                processes: [
                    {
                        ...metadata([OFFER_SPOT]).lifecycle_builder_v1.processes[0],
                        stages: [
                            {
                                id: "stage_wl",
                                key: "waitlist",
                                label: "Waitlist",
                                sort_order: 1,
                                is_active: true,
                                action_catalog_v1: {
                                    version: 1,
                                    candidate_actions: [OFFER_SPOT],
                                    catalog_level_future_key: "keep",
                                },
                            },
                        ],
                    },
                ],
            },
        });
        const written = JSON.stringify(serializeLifecycleBuilderV1(builder));

        expect(written).toContain("catalog_level_future_key");
    });
});

describe("preservation does not freeze configuration", () => {
    it("an edited field changes", () => {
        const parsed = parseStageActionCatalogV1({ version: 1, candidate_actions: [OFFER_SPOT] })!;
        const edited = {
            ...parsed,
            candidate_actions: [{ ...parsed.candidate_actions[0], work_template_key: "review_waitlist_position" }],
        };
        const written = serializeStageActionCatalogV1(edited) as { candidate_actions: Record<string, unknown>[] };

        expect(written.candidate_actions[0].work_template_key).toBe("review_waitlist_position");
    });

    it("a deliberately removed row stays removed", () => {
        const parsed = parseStageActionCatalogV1({ version: 1, candidate_actions: [OFFER_SPOT] })!;
        const written = serializeStageActionCatalogV1({ ...parsed, candidate_actions: [] }) as {
            candidate_actions: unknown[];
        };

        expect(written.candidate_actions).toEqual([]);
    });

    it("a deliberately removed FIELD stays removed", () => {
        // An operator unbinding the work template must not have it restored from residue.
        const parsed = parseStageActionCatalogV1({ version: 1, candidate_actions: [OFFER_SPOT] })!;
        const { work_template_key: _dropped, ...withoutBinding } = parsed.candidate_actions[0];
        const written = serializeStageActionCatalogV1({
            ...parsed,
            candidate_actions: [withoutBinding as (typeof parsed.candidate_actions)[number]],
        }) as { candidate_actions: Record<string, unknown>[] };

        expect(written.candidate_actions[0].work_template_key).toBeUndefined();
    });
});

describe("both configuration families are lossless now", () => {
    it("a packet requirement and an action binding survive the same unrelated save", () => {
        const base = metadata([OFFER_SPOT]);
        base.lifecycle_builder_v1.processes[0].stages[1] = {
            ...base.lifecycle_builder_v1.processes[0].stages[1],
            requirements_v1: {
                version: 1,
                requirements: [
                    {
                        requirement_id: "enrollment_packet",
                        kind: "packet",
                        packet_definition_id: "c03425c9-2b05-4847-8495-2b2713e36243",
                        level: "required",
                        enforcement: "blocking",
                    },
                ],
            },
            // `metadata()` infers its stages from a literal that has never carried a requirement, so
            // the very field under test is absent from the inferred type. The cast widens through
            // `unknown` deliberately: the point of this case is that an unrelated save preserves a
            // key the fixture builder does not model.
        } as unknown as (typeof base.lifecycle_builder_v1.processes)[0]["stages"][number];

        const builder = lifecycleBuilderFromDepartmentMetadata(base);
        const written = JSON.stringify(
            serializeLifecycleBuilderV1(renameStage(builder, "proc_1", "stage_wl", "Waitlist (renamed)")),
        );

        expect(written).toContain("offer_spot");
        expect(written).toContain("c03425c9-2b05-4847-8495-2b2713e36243");

        const reread = lifecycleBuilderFromDepartmentMetadata({ lifecycle_builder_v1: JSON.parse(written) });
        const enrolling = activeLifecycleProcess(reread)?.stages.find((s) => s.key === "enrolling");
        expect(enrolling?.requirements_v1?.requirements).toHaveLength(1);
    });
});
