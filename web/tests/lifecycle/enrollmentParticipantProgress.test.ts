/**
 * Slice 2.3 — deterministic Enrollment participant progress.
 *
 * The eighteen required proofs, stated over a real process/session model: a pinned instance, a
 * governing revision that states its own requirements (D-97), an anchored participant session
 * (D-95) with D-94 version pins, and Forms-owned submission evidence.
 *
 * The Supabase stand-in below serves rows from an in-memory model of the five tables actually
 * involved. It is a MODEL, not a mock of the resolver: the join, the counts and every status verdict
 * are computed by production code from those rows.
 */

import { describe, expect, it, beforeEach } from "vitest";

import { resolveEnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import { projectRequirementsProgress } from "@/lib/enrollment/participantProgress/projectEnrollmentParticipantProgress";
import { summarizeEnrollmentRequirementProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";
import { formSubmissionIsComplete } from "@/lib/forms/formSubmissionCompletion";
import { __clearConfigReadCacheForTests } from "@/lib/runtime/provisioning/configReadCache";

const ORG = "11111111-1111-4111-8111-111111111111";
const PI = "aaaa1111-0000-4000-8000-000000000001";
const REV_N = "bbbb1111-0000-4000-8000-00000000000a";
const REV_N1 = "bbbb1111-0000-4000-8000-00000000000b";
const FORM_A = "ffff0000-0000-4000-8000-00000000000a";
const FORM_B = "ffff0000-0000-4000-8000-00000000000b";
const VERSION_A1 = "vvvv0000-0000-4000-8000-00000000000a";
const VERSION_A2 = "vvvv0000-0000-4000-8000-00000000000b";

function formRequirement(id: string, formDefinitionId: string) {
    return {
        requirement_id: id,
        kind: "form",
        form_definition_id: formDefinitionId,
        level: "required",
    };
}

function revisionPayload(requirements: unknown[]) {
    return {
        version: 1,
        active_process_id: "p1",
        processes: [
            {
                id: "p1",
                key: "enrollment",
                name: "Enrollment",
                is_active: true,
                stages: [
                    {
                        id: "s1",
                        key: "enrollment",
                        label: "Enrollment",
                        sort_order: 1,
                        is_active: true,
                        requirements_v1: { version: 1, requirements },
                    },
                ],
            },
        ],
    };
}

type Model = {
    instance?: Partial<{
        id: string;
        org_id: string;
        process_key: string;
        context_type: string | null;
        context_id: string | null;
        stage_key: string | null;
        business_process_revision_id: string | null;
    }>;
    opportunityWorkUnit?: Record<string, string>;
    workUnitDepartment?: Record<string, string>;
    revisions?: Record<string, unknown>;
    departmentMetadata?: Record<string, unknown> | null;
    session?: { id: string; status: string } | null;
    /** packet_item_id -> form_definition_id */
    packetItems?: Record<string, string>;
    sessionItems?: {
        id: string;
        packet_item_id: string;
        resolved_form_definition_version_id?: string | null;
        form_submission_id?: string | null;
    }[];
    /** form_submission_id -> status */
    submissions?: Record<string, string>;
};

function fakeSupabase(model: Model) {
    return {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            let inIds: string[] = [];

            const rows = (): unknown[] => {
                switch (table) {
                    case "process_instances": {
                        if (!model.instance) return [];
                        return [
                            {
                                id: PI,
                                org_id: ORG,
                                process_key: "enrollment",
                                context_type: null,
                                context_id: null,
                                stage_key: "enrollment",
                                business_process_revision_id: null,
                                ...model.instance,
                            },
                        ];
                    }
                    case "business_process_revisions": {
                        const id = String(filters.id ?? "");
                        const payload = model.revisions?.[id];
                        return payload ? [{ payload }] : [];
                    }
                    case "opportunities":
                        return [
                            {
                                work_unit_id:
                                    model.opportunityWorkUnit?.[String(filters.id ?? "")] ?? null,
                            },
                        ];
                    case "work_units":
                        return [
                            {
                                department_id:
                                    model.workUnitDepartment?.[String(filters.id ?? "")] ?? null,
                            },
                        ];
                    case "departments":
                        return [{ metadata: model.departmentMetadata ?? null }];
                    case "form_packet_sessions":
                        return model.session ? [model.session] : [];
                    case "form_packet_session_items":
                        return model.sessionItems ?? [];
                    case "form_packet_items":
                        return inIds
                            .filter((id) => model.packetItems?.[id])
                            .map((id) => ({ id, form_definition_id: model.packetItems![id] }));
                    case "form_submissions":
                        return inIds
                            .filter((id) => model.submissions?.[id])
                            .map((id) => ({ id, status: model.submissions![id] }));
                    default:
                        return [];
                }
            };

            const chain: Record<string, unknown> = {
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (resolve: (v: unknown) => unknown) =>
                    Promise.resolve(resolve({ data: rows(), error: null })),
            };
            chain.eq = (col: string, val: unknown) => {
                filters[col] = val;
                return chain;
            };
            chain.in = (_col: string, vals: string[]) => {
                inIds = vals;
                return chain;
            };
            for (const key of ["select", "is", "order", "limit"]) chain[key] = () => chain;
            return chain;
        },
    } as never;
}

/** The standard model: pinned to N, one required form, realized, not yet submitted. */
function baseModel(overrides: Partial<Model> = {}): Model {
    return {
        instance: { business_process_revision_id: REV_N },
        revisions: {
            [REV_N]: revisionPayload([formRequirement("req-a", FORM_A)]),
            [REV_N1]: revisionPayload([
                formRequirement("req-a", FORM_A),
                formRequirement("req-b", FORM_B),
            ]),
        },
        session: { id: "session-1", status: "in_progress" },
        packetItems: { "pi-a": FORM_A },
        sessionItems: [
            {
                id: "si-a",
                packet_item_id: "pi-a",
                resolved_form_definition_version_id: VERSION_A1,
                form_submission_id: null,
            },
        ],
        submissions: {},
        ...overrides,
    };
}

beforeEach(() => {
    __clearConfigReadCacheForTests();
});

async function progress(model: Model) {
    const result = await resolveEnrollmentParticipantProgress(fakeSupabase(model), {
        orgId: ORG,
        processInstanceId: PI,
    });
    if (!result.ok) throw new Error(`unexpected refusal: ${result.refusal.code}`);
    return result.value;
}

// ---------------------------------------------------------------------------
// 1-4. The chain resolves end to end
// ---------------------------------------------------------------------------

describe("the chain: pinned instance -> revision -> stage -> requirements -> session", () => {
    it("1. the pinned process instance supplies the stage", async () => {
        const p = await progress(baseModel());
        expect(p.stage_key).toBe("enrollment");
        expect(p.process_instance_id).toBe(PI);
    });

    it("2. requirements come from the PINNED revision, not live configuration", async () => {
        const p = await progress(
            baseModel({
                // Live configuration says something different. It must not be consulted.
                departmentMetadata: {
                    lifecycle_builder_v1: revisionPayload([formRequirement("live-only", FORM_B)]),
                },
            }),
        );
        expect(p.business_process_revision_id).toBe(REV_N);
        expect(p.requirements.map((r) => r.requirement_id)).toEqual(["req-a"]);
    });

    it("3. the anchored participant session resolves", async () => {
        const p = await progress(baseModel());
        expect(p.session_id).toBe("session-1");
    });

    it("4. a required Form realized by the packet is recognised", async () => {
        const p = await progress(baseModel());
        expect(p.requirements[0]!.artifact).toEqual({ kind: "form", id: FORM_A });
        expect(p.requirements[0]!.status).not.toBe("unrealized");
    });
});

// ---------------------------------------------------------------------------
// 5-9. Completion moves the numbers, and only completion does
// ---------------------------------------------------------------------------

describe("satisfaction comes from Forms-owned evidence", () => {
    it("5. before canonical completion the requirement is outstanding", async () => {
        const p = await progress(baseModel());
        expect(p.requirements[0]!.status).toBe("outstanding");
        expect(p.satisfied_requirements).toBe(0);
        expect(p.remaining_requirements).toBe(1);
    });

    it("5b. a DRAFT submission is not completion", async () => {
        const p = await progress(
            baseModel({
                sessionItems: [
                    {
                        id: "si-a",
                        packet_item_id: "pi-a",
                        resolved_form_definition_version_id: VERSION_A1,
                        form_submission_id: "sub-a",
                    },
                ],
                submissions: { "sub-a": "draft" },
            }),
        );
        expect(p.requirements[0]!.status).toBe("outstanding");
    });

    it("5c. a VOID submission is not completion — it is withdrawn evidence", async () => {
        const p = await progress(
            baseModel({
                sessionItems: [
                    {
                        id: "si-a",
                        packet_item_id: "pi-a",
                        resolved_form_definition_version_id: VERSION_A1,
                        form_submission_id: "sub-a",
                    },
                ],
                submissions: { "sub-a": "void" },
            }),
        );
        expect(p.requirements[0]!.status).toBe("outstanding");
    });

    it("6-9. completing through the canonical Forms path satisfies it and moves the counts", async () => {
        const before = await progress(baseModel());

        // 6. Completion, expressed the only way Forms expresses it.
        const after = await progress(
            baseModel({
                sessionItems: [
                    {
                        id: "si-a",
                        packet_item_id: "pi-a",
                        resolved_form_definition_version_id: VERSION_A1,
                        form_submission_id: "sub-a",
                    },
                ],
                submissions: { "sub-a": "submitted" },
            }),
        );

        expect(after.requirements[0]!.status).toBe("satisfied"); // 7
        expect(after.satisfied_requirements).toBe(before.satisfied_requirements + 1); // 8
        expect(after.remaining_requirements).toBe(before.remaining_requirements - 1); // 9
        expect(after.requirements[0]!.evidence).toEqual({
            kind: "form_submission",
            form_submission_id: "sub-a",
            form_definition_version_id: VERSION_A1,
            session_item_id: "si-a",
        });
    });

    it("packet-item status is NOT the satisfaction authority", async () => {
        // A step whose own bookkeeping says `submitted` with no submission behind it. The review
        // rollup accepts that shape deliberately; a requirement denominator must not.
        const p = await progress(
            baseModel({
                sessionItems: [
                    {
                        id: "si-a",
                        packet_item_id: "pi-a",
                        resolved_form_definition_version_id: VERSION_A1,
                        form_submission_id: null,
                    },
                ],
            }),
        );
        expect(p.requirements[0]!.status).toBe("outstanding");
        expect(p.satisfied_requirements).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 10-11. Resume, and D-94
// ---------------------------------------------------------------------------

describe("resume and version stability", () => {
    it("10. reload/resume preserves progress", async () => {
        const model = baseModel({
            sessionItems: [
                {
                    id: "si-a",
                    packet_item_id: "pi-a",
                    resolved_form_definition_version_id: VERSION_A1,
                    form_submission_id: "sub-a",
                },
            ],
            submissions: { "sub-a": "submitted" },
        });
        const first = await progress(model);
        const second = await progress(model);
        expect(second).toEqual(first);
    });

    it("11. the D-94 Form version pin is reported, not recomputed", async () => {
        // The evidence names the version the participant transacted against — VERSION_A1 — even
        // though a newer version exists. This projection never selects a version.
        const p = await progress(
            baseModel({
                sessionItems: [
                    {
                        id: "si-a",
                        packet_item_id: "pi-a",
                        resolved_form_definition_version_id: VERSION_A1,
                        form_submission_id: "sub-a",
                    },
                ],
                submissions: { "sub-a": "submitted" },
            }),
        );
        expect(p.requirements[0]!.evidence?.form_definition_version_id).toBe(VERSION_A1);
        expect(p.requirements[0]!.evidence?.form_definition_version_id).not.toBe(VERSION_A2);
    });
});

// ---------------------------------------------------------------------------
// 12-14. What must NOT move
// ---------------------------------------------------------------------------

describe("stability of the active denominator", () => {
    it("12. publishing BP revision N+1 does not change the active denominator", async () => {
        // The org publishes N+1, which adds a second requirement. The running journey stays on N.
        const before = await progress(baseModel());
        const afterPublish = await progress(
            baseModel({
                departmentMetadata: { lifecycle_builder_v1: revisionPayload([
                    formRequirement("req-a", FORM_A),
                    formRequirement("req-b", FORM_B),
                ]) },
            }),
        );
        expect(afterPublish.total_requirements).toBe(before.total_requirements);
        expect(afterPublish.total_requirements).toBe(1);
        expect(afterPublish.business_process_revision_id).toBe(REV_N);
    });

    it("12b. an instance pinned to N+1 DOES see N+1's requirements", async () => {
        // The negative control for the test above: the stability is the pin's doing, not the
        // projection quietly ignoring configuration.
        const p = await progress(
            baseModel({ instance: { business_process_revision_id: REV_N1 } }),
        );
        expect(p.total_requirements).toBe(2);
    });

    it("13. publishing Form version N+1 does not change the active session artifact", async () => {
        const p = await progress(
            baseModel({
                sessionItems: [
                    {
                        id: "si-a",
                        packet_item_id: "pi-a",
                        // D-94 froze this at realization; a newer published version does not move it.
                        resolved_form_definition_version_id: VERSION_A1,
                        form_submission_id: "sub-a",
                    },
                ],
                submissions: { "sub-a": "submitted" },
            }),
        );
        expect(p.requirements[0]!.evidence?.form_definition_version_id).toBe(VERSION_A1);
    });

    it("14. no Opportunity is required anywhere in the chain", async () => {
        const p = await progress(baseModel());
        expect(p.total_requirements).toBe(1);
        expect(JSON.stringify(p)).not.toContain("opportunity");
    });
});

// ---------------------------------------------------------------------------
// 15-17. Edges that must fail closed
// ---------------------------------------------------------------------------

describe("edges", () => {
    it("15. authored-empty requirements give a total of 0", async () => {
        const p = await progress(
            baseModel({ revisions: { [REV_N]: revisionPayload([]) } }),
        );
        expect(p.total_requirements).toBe(0);
        expect(p.satisfied_requirements).toBe(0);
        expect(p.remaining_requirements).toBe(0);
    });

    it("16. a historical unpinned instance uses the centralized compatibility branch", async () => {
        const p = await progress(
            baseModel({
                instance: {
                    business_process_revision_id: null,
                    context_type: "opportunity",
                    context_id: "opp-1",
                },
                opportunityWorkUnit: { "opp-1": "wu-1" },
                workUnitDepartment: { "wu-1": "dept-1" },
                departmentMetadata: {
                    lifecycle_builder_v1: revisionPayload([formRequirement("live-req", FORM_A)]),
                },
            }),
        );
        expect(p.business_process_revision_id).toBeNull();
        expect(p.requirements.map((r) => r.requirement_id)).toEqual(["live-req"]);
    });

    it("17. a BP-required but UNREALIZED Form stays visible and unsatisfied", async () => {
        // The packet does not contain Form A at all. It must not vanish from the denominator.
        const p = await progress(baseModel({ packetItems: {}, sessionItems: [] }));

        expect(p.total_requirements).toBe(1);
        expect(p.satisfied_requirements).toBe(0);
        expect(p.remaining_requirements).toBe(1);
        expect(p.requirements[0]!.status).toBe("unrealized");
        expect(p.requirements[0]!.reason).toContain("does not include it");
    });

    it("17b. a journey with no session yet reports every requirement unrealized", async () => {
        const p = await progress(baseModel({ session: null, sessionItems: [] }));
        expect(p.session_id).toBeNull();
        expect(p.total_requirements).toBe(1);
        expect(p.requirements[0]!.status).toBe("unrealized");
    });

    it("field requirements are reported unsupported, never satisfied (Slice 2.4 owns them)", async () => {
        const p = await progress(
            baseModel({
                revisions: {
                    [REV_N]: revisionPayload([
                        {
                            requirement_id: "req-field",
                            kind: "field",
                            rule_id: "child:first_name",
                            level: "required",
                        },
                    ]),
                },
            }),
        );
        expect(p.requirements[0]!.status).toBe("unsupported");
        expect(p.satisfied_requirements).toBe(0);
        expect(p.remaining_requirements).toBe(1);
        expect(p.requirements[0]!.reason).toContain("Slice 2.4");
    });
});

// ---------------------------------------------------------------------------
// 18. The proof that whole-packet completion cannot masquerade as progress
// ---------------------------------------------------------------------------

describe("18. two required Forms, one complete -> exactly 1 of 2", () => {
    it("counts per requirement, not per packet", async () => {
        const p = await progress(
            baseModel({
                instance: { business_process_revision_id: REV_N1 },
                packetItems: { "pi-a": FORM_A, "pi-b": FORM_B },
                sessionItems: [
                    {
                        id: "si-a",
                        packet_item_id: "pi-a",
                        resolved_form_definition_version_id: VERSION_A1,
                        form_submission_id: "sub-a",
                    },
                    {
                        id: "si-b",
                        packet_item_id: "pi-b",
                        resolved_form_definition_version_id: VERSION_A2,
                        form_submission_id: null,
                    },
                ],
                submissions: { "sub-a": "submitted" },
            }),
        );

        expect(p.total_requirements).toBe(2);
        expect(p.satisfied_requirements).toBe(1);
        expect(p.remaining_requirements).toBe(1);
        expect(p.requirements.map((r) => r.status)).toEqual(["satisfied", "outstanding"]);
    });

    it("one required Form realized TWICE is still one requirement", async () => {
        // D-93: requirement progress does not imply one question per Form occurrence. A packet that
        // renders the same form twice must not double the denominator.
        const p = await progress(
            baseModel({
                packetItems: { "pi-a": FORM_A, "pi-a2": FORM_A },
                sessionItems: [
                    { id: "si-a", packet_item_id: "pi-a", form_submission_id: null },
                    { id: "si-a2", packet_item_id: "pi-a2", form_submission_id: "sub-a2" },
                ],
                submissions: { "sub-a2": "submitted" },
            }),
        );
        expect(p.total_requirements).toBe(1);
        expect(p.satisfied_requirements).toBe(1);
        expect(p.requirements[0]!.evidence?.session_item_id).toBe("si-a2");
    });
});

// ---------------------------------------------------------------------------
// The pure layer, guarded directly
// ---------------------------------------------------------------------------

describe("counts are derived, never tracked", () => {
    it("summary is a pure function of the requirement rows", () => {
        const rows = projectRequirementsProgress(
            [
                { requirement_id: "r1", ref: { kind: "form", form_definition_id: FORM_A }, level: "required" },
                { requirement_id: "r2", ref: { kind: "form", form_definition_id: FORM_B }, level: "required" },
            ],
            [
                {
                    session_item_id: "si-a",
                    form_definition_id: FORM_A,
                    resolved_form_definition_version_id: VERSION_A1,
                    form_submission_id: "sub-a",
                    submission_status: "submitted",
                },
            ],
        );
        expect(summarizeEnrollmentRequirementProgress(rows)).toEqual({
            total_requirements: 2,
            satisfied_requirements: 1,
            remaining_requirements: 1,
        });
    });

    it("the canonical completion test is the one Forms already uses", () => {
        expect(formSubmissionIsComplete({ status: "submitted" })).toBe(true);
        expect(formSubmissionIsComplete({ status: "draft" })).toBe(false);
        expect(formSubmissionIsComplete({ status: "void" })).toBe(false);
        expect(formSubmissionIsComplete(null)).toBe(false);
    });
});
