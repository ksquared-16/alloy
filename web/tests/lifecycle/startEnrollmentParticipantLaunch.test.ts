/**
 * B1 — Start Enrollment realizes the participant objective from Business Process requirements.
 *
 * The whole chain runs for real against an in-memory Supabase double: the entry-stage declaration,
 * the requirement projection, the derived packet, the mint path, the anchored session, and the
 * participant token resolution that a browser would perform. Nothing between "operator pressed
 * Start" and "the token resolves an objective" is stubbed.
 *
 * The double models the constraints that carry the invariants — `UNIQUE (org_id, key)` on packet
 * definitions, the 1:1 link binding and the one-current-session partial index — because those are
 * what make "no second participant objective" true, and a test that ignored them would prove a
 * weaker statement than the product makes.
 */

import { describe, expect, it } from "vitest";

import { startEnrollment } from "@/lib/records/startEnrollmentService";
import { createEnrollmentProcessInstance } from "@/lib/process/processInstances";
import { resolveEnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import { launchParticipantEnrollment } from "@/lib/enrollment/participantLaunch/launchParticipantEnrollment";
import {
    planRequirementDerivedPacket,
    requirementDerivedPacketKey,
} from "@/lib/enrollment/participantLaunch/requirementDerivedPacket";
import {
    resolveProcessEntryStage,
    resolveEffectiveStageKey,
} from "@/lib/lifecycle/processEntryStage";
import {
    entryIntentFromProcessInstanceMetadata,
    isProcessEntryIntent,
} from "@/lib/lifecycle/processEntryPointsV1";
import {
    PUBLISH_ENTRY_INTENT_UNKNOWN,
    PUBLISH_ENTRY_STAGE_UNRESOLVABLE,
    validateBusinessProcessForPublish,
} from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import {
    parseLifecycleBuilderV1,
    serializeLifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { resolveParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { readShareEmbedPath } from "@/lib/admin/forms/distributionLinkReuse";
import { __clearConfigReadCacheForTests } from "@/lib/runtime/provisioning/configReadCache";

const ORG = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const HOUSEHOLD = "33333333-3333-4333-8333-333333333333";
const REVISION = "44444444-4444-4444-8444-444444444444";
const DEPARTMENT = "44444444-4444-4444-8444-4444444444de";
const FORM_A = "55555555-5555-4555-8555-555555555555";
const FORM_B = "66666666-6666-4666-8666-666666666666";
const VERSION_A = "77777777-7777-4777-8777-777777777777";
const VERSION_B = "88888888-8888-4888-8888-888888888888";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration fixtures
// ─────────────────────────────────────────────────────────────────────────────

function formRequirement(id: string, formDefinitionId: string) {
    return { requirement_id: id, kind: "form", form_definition_id: formDefinitionId, level: "required" };
}

function revisionPayload(opts: {
    /** `null` authors no entry points at all. Otherwise the intent → stage map, verbatim. */
    entryPoints?: Record<string, string> | null;
    requirements?: unknown[] | null;
    stageKeys?: string[];
} = {}) {
    const stageKeys = opts.stageKeys ?? ["lead", "enrolling", "enrolled"];
    const entryPoints =
        opts.entryPoints === null
            ? null
            : (opts.entryPoints ?? { create_lead: "lead", enrollment_start: "enrolling" });
    return {
        version: 1,
        active_process_id: "proc-1",
        processes: [
            {
                id: "proc-1",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                ...(entryPoints ? { entry_points_v1: { version: 1, by_intent: entryPoints } } : {}),
                stages: stageKeys.map((key, i) => ({
                    id: `stage-${key}`,
                    key,
                    label: key,
                    sort_order: i,
                    is_active: true,
                    ...(key === "enrolling" && opts.requirements !== null
                        ? {
                              requirements_v1: {
                                  version: 1,
                                  requirements: opts.requirements ?? [formRequirement("r1", FORM_A)],
                              },
                          }
                        : {}),
                })),
            },
        ],
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory Supabase double
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeDb(payload: unknown): Record<string, Row[]> {
    return {
        customer_members: [
            { id: CHILD, org_id: ORG, customer_id: HOUSEHOLD, relationship: "child", display_name: "Ada" },
        ],
        process_instances: [],
        // The D-96 pin is resolved by the REAL resolver, so the publication row it reads has to
        // exist. One department publishing Enrollment is the unambiguous D-98 case — the sole
        // Enrollment department selects itself, and no context is needed.
        configuration_publications: [
            {
                id: "pub-1",
                org_id: ORG,
                domain_key: "business_process",
                subject_id: DEPARTMENT,
                revision_id: REVISION,
                revision_number: 1,
            },
        ],
        business_process_revisions: [{ id: REVISION, org_id: ORG, payload }],
        form_definitions: [
            { id: FORM_A, org_id: ORG, key: "form_a", name: "Health Report", kind: "form", is_active: true, metadata: {} },
            { id: FORM_B, org_id: ORG, key: "form_b", name: "Consent", kind: "form", is_active: true, metadata: {} },
        ],
        form_definition_versions: [
            { id: VERSION_A, org_id: ORG, form_definition_id: FORM_A, status: "published", version_number: 1, schema_json: { fields: [] } },
            { id: VERSION_B, org_id: ORG, form_definition_id: FORM_B, status: "published", version_number: 1, schema_json: { fields: [] } },
        ],
        form_packet_definitions: [],
        form_packet_items: [],
        form_packet_sessions: [],
        form_packet_session_items: [],
        form_public_links: [],
        opportunities: [],
    };
}

let idCounter = 0;
/**
 * Real uuids, because production code validates them. `mintPacketPublicLinkForAdmin` runs
 * `parseUuidParam` over the packet definition id, so a readable stand-in id would fail the mint for
 * a reason that has nothing to do with what is under test.
 */
function nextId(_prefix: string) {
    idCounter += 1;
    const tail = String(idCounter).padStart(12, "0");
    return `deadbeef-0000-4000-8000-${tail}`;
}

/** Enforces exactly the constraints the invariants depend on. */
function checkConstraints(table: string, row: Row, rows: Row[]): string | null {
    if (table === "form_packet_definitions") {
        if (rows.some((r) => r.org_id === row.org_id && r.key === row.key)) {
            return "duplicate key value violates unique constraint uq_form_packet_definitions_org_key";
        }
    }
    if (table === "form_packet_sessions") {
        if (rows.some((r) => r.started_via_public_link_id === row.started_via_public_link_id)) {
            return "duplicate key value violates unique constraint uq_form_packet_sessions_one_link";
        }
        if (
            row.process_instance_id &&
            rows.some((r) => r.process_instance_id === row.process_instance_id && r.status === "in_progress")
        ) {
            return "duplicate key value violates unique constraint uq_form_packet_sessions_current_process_instance";
        }
    }
    return null;
}

function client(db: Record<string, Row[]>) {
    const from = (table: string) => {
        const filters: { col: string; val: unknown; op: "eq" | "in" | "is" }[] = [];
        let mode: "select" | "insert" | "update" = "select";
        let pending: Row[] = [];
        let patch: Row = {};
        let orderCol: string | null = null;
        let orderAsc = true;
        let insertError: string | null = null;

        const rowsOf = () => (db[table] ??= []);
        const matches = (r: Row) =>
            filters.every((f) => {
                if (f.op === "in") return (f.val as unknown[]).includes(r[f.col]);
                // `.is(col, null)` must treat absent and null alike, the way SQL IS NULL does.
                if (f.op === "is") return (r[f.col] ?? null) === f.val;
                return r[f.col] === f.val;
            });
        const selected = () => {
            let out = rowsOf().filter(matches);
            if (orderCol) {
                const col = orderCol;
                out = [...out].sort((a, b) => {
                    const av = a[col] as number | string;
                    const bv = b[col] as number | string;
                    return (av > bv ? 1 : av < bv ? -1 : 0) * (orderAsc ? 1 : -1);
                });
            }
            return out;
        };

        const resolveList = () => {
            if (mode === "insert") {
                return insertError ? { data: null, error: { message: insertError, code: "23505" } } : { data: pending, error: null };
            }
            if (mode === "update") {
                const hit = rowsOf().filter(matches);
                for (const r of hit) Object.assign(r, patch);
                return { data: hit, error: null };
            }
            return { data: selected(), error: null };
        };

        /*
                 * Self-referential double: `upsert` delegates to `insert` on the same
                 * object, so `Record<string, unknown>` left that member untyped.
                 * Only the delegated member is declared.
                 */
                const q: Record<string, unknown> & { insert: (payload: Row | Row[]) => unknown } = {
            select: () => q,
            eq: (col: string, val: unknown) => {
                filters.push({ col, val, op: "eq" });
                return q;
            },
            in: (col: string, val: unknown[]) => {
                filters.push({ col, val, op: "in" });
                return q;
            },
            is: (col: string, val: unknown) => {
                filters.push({ col, val, op: "is" });
                return q;
            },
            order: (col: string, opts?: { ascending?: boolean }) => {
                orderCol = col;
                orderAsc = opts?.ascending !== false;
                return q;
            },
            limit: () => q,
            insert: (payload: Row | Row[]) => {
                mode = "insert";
                const list = Array.isArray(payload) ? payload : [payload];
                const rows = rowsOf();
                pending = [];
                for (const raw of list) {
                    const row: Row = { id: raw.id ?? nextId(table), ...raw };
                    const violation = checkConstraints(table, row, rows);
                    if (violation) {
                        insertError = violation;
                        pending = [];
                        return q;
                    }
                    rows.push(row);
                    pending.push(row);
                }
                return q;
            },
            /*
             * Start Enrollment anchors the journey to the child's Enrollment Participation, so the
             * process-instance write is now an upsert on `(org, process_key, subject, context_id)`
             * rather than a bare insert. `ignoreDuplicates` returns NO ROW on conflict, which is the
             * one behaviour worth modelling here — it is how "this journey already exists" is told
             * apart from a failure.
             */
            upsert: (payload: Row | Row[], opts?: { ignoreDuplicates?: boolean }) => {
                const list = Array.isArray(payload) ? payload : [payload];
                const rows = rowsOf();
                const conflict = list.some((raw) =>
                    rows.some(
                        (r) =>
                            r.org_id === raw.org_id &&
                            r.process_key === raw.process_key &&
                            r.subject_id === raw.subject_id &&
                            (r.context_id ?? null) === (raw.context_id ?? null),
                    ),
                );
                if (conflict && opts?.ignoreDuplicates) {
                    mode = "insert";
                    pending = [];
                    return q;
                }
                return q.insert(payload);
            },
            update: (p: Row) => {
                mode = "update";
                patch = p;
                return q;
            },
            maybeSingle: async () => {
                const res = resolveList();
                if (res.error) return { data: null, error: res.error };
                return { data: (res.data as Row[])[0] ?? null, error: null };
            },
            single: async () => {
                const res = resolveList();
                if (res.error) return { data: null, error: res.error };
                const row = (res.data as Row[])[0];
                return row ? { data: row, error: null } : { data: null, error: { message: "no rows" } };
            },
            then: (resolve: (v: unknown) => void) => resolve(resolveList()),
        };
        return q;
    };
    return { from } as never;
}

async function startWithConfig(payload: unknown) {
    __clearConfigReadCacheForTests();
    const db = makeDb(payload);
    const supabase = client(db);
    const result = await startEnrollment(supabase, { orgId: ORG, customerMemberId: CHILD });
    return { db, supabase, result };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1–2. Entry stage
// ─────────────────────────────────────────────────────────────────────────────

describe("D-103 — entry intent resolves the entry stage", () => {
    const built = () => parseLifecycleBuilderV1(revisionPayload())!.processes[0];

    it("1 + 2. create_lead resolves lead, enrollment_start resolves enrolling", () => {
        const process = built();

        expect(resolveProcessEntryStage(process, "create_lead")).toMatchObject({
            ok: true,
            stageKey: "lead",
        });
        expect(resolveProcessEntryStage(process, "enrollment_start")).toMatchObject({
            ok: true,
            stageKey: "enrolling",
        });

        // The intent comes from the journey's own provenance, which the insert helper has always
        // written — `enrollment_start` is Start Enrollment's existing literal, not a new name.
        expect(entryIntentFromProcessInstanceMetadata({ source: "enrollment_start" })).toBe("enrollment_start");
        expect(entryIntentFromProcessInstanceMetadata({ source: "create_lead" })).toBe("create_lead");
    });

    it("3 + 4. neither intent can inherit the other's stage", () => {
        // Only Create Lead is mapped. A Start Enrollment journey resolves NOTHING rather than
        // falling through to `lead` — that fallthrough is precisely what a process-global scalar did.
        const leadOnly = parseLifecycleBuilderV1(
            revisionPayload({ entryPoints: { create_lead: "lead" } }),
        )!.processes[0];
        const startUnmapped = resolveProcessEntryStage(leadOnly, "enrollment_start");
        expect(startUnmapped.ok).toBe(false);
        expect(!startUnmapped.ok && startUnmapped.reason).toBe("intent_not_mapped");
        expect(
            resolveEffectiveStageKey({
                persistedStageKey: null,
                process: leadOnly,
                intent: "enrollment_start",
            }),
        ).toBeNull();

        // And the reverse: Start Enrollment mapped alone must not hand `enrolling` to Create Lead.
        const startOnly = parseLifecycleBuilderV1(
            revisionPayload({ entryPoints: { enrollment_start: "enrolling" } }),
        )!.processes[0];
        const leadUnmapped = resolveProcessEntryStage(startOnly, "create_lead");
        expect(!leadUnmapped.ok && leadUnmapped.reason).toBe("intent_not_mapped");

        // With both mapped, each keeps its own — no bleed in either direction.
        const both = built();
        expect(
            resolveEffectiveStageKey({ persistedStageKey: null, process: both, intent: "create_lead" }),
        ).toBe("lead");
        expect(
            resolveEffectiveStageKey({ persistedStageKey: null, process: both, intent: "enrollment_start" }),
        ).toBe("enrolling");

        // A persisted stage still wins for both — it is where the journey actually is.
        expect(
            resolveEffectiveStageKey({ persistedStageKey: "enrolled", process: both, intent: "create_lead" }),
        ).toBe("enrolled");
    });

    it("5. an unknown initiation intent fails closed, at publish and at runtime", () => {
        // Publish REFUSES an authored intent the platform cannot supply. The parser drops the key,
        // so without this check a typo would silently become "that intent is not configured".
        const typo = revisionPayload({ entryPoints: { create_lead: "lead", start_enrolment: "enrolling" } });
        const finding = validateBusinessProcessForPublish(typo).errors.find(
            (e) => e.code === PUBLISH_ENTRY_INTENT_UNKNOWN,
        );
        expect(finding, "publish must refuse an unknown entry intent").toBeTruthy();
        expect(finding?.detail).toMatchObject({ authored_intent: "start_enrolment" });

        // At runtime an unreadable provenance falls to the platform default rather than to a stage:
        // `create_lead` is what the insert helper itself writes when no creator names a source.
        expect(entryIntentFromProcessInstanceMetadata({ source: "who_knows" })).toBe("create_lead");
        expect(entryIntentFromProcessInstanceMetadata(null)).toBe("create_lead");
        expect(isProcessEntryIntent("start_enrolment")).toBe(false);
    });

    it("6. a mapping to a missing or inactive stage refuses publication", () => {
        const dangling = revisionPayload({
            entryPoints: { create_lead: "lead", enrollment_start: "no_such_stage" },
        });
        const finding = validateBusinessProcessForPublish(dangling).errors.find(
            (e) => e.code === PUBLISH_ENTRY_STAGE_UNRESOLVABLE,
        );
        expect(finding, "publish must refuse an unresolvable entry stage").toBeTruthy();
        expect(finding?.detail).toMatchObject({
            entry_intent: "enrollment_start",
            declared_entry_stage_key: "no_such_stage",
        });

        // A deactivated stage is not an entry point either.
        const deactivated = parseLifecycleBuilderV1(revisionPayload())!.processes[0];
        const enrolling = deactivated.stages.find((s) => s.key === "enrolling")!;
        enrolling.is_active = false;
        const off = resolveProcessEntryStage(deactivated, "enrollment_start");
        expect(!off.ok && off.reason).toBe("declared_stage_missing");

        // A well-formed map publishes cleanly.
        const clean = validateBusinessProcessForPublish(revisionPayload()).errors;
        expect(clean.some((e) => e.code === PUBLISH_ENTRY_STAGE_UNRESOLVABLE)).toBe(false);
        expect(clean.some((e) => e.code === PUBLISH_ENTRY_INTENT_UNKNOWN)).toBe(false);
    });

    it("unauthored entry points are an unanswered question, not a default", () => {
        const undeclared = parseLifecycleBuilderV1(revisionPayload({ entryPoints: null }))!.processes[0];
        const none = resolveProcessEntryStage(undeclared, "enrollment_start");
        expect(!none.ok && none.reason).toBe("not_declared");
        // And publication does not block it — every revision published before D-103 is in this state.
        expect(
            validateBusinessProcessForPublish(revisionPayload({ entryPoints: null })).errors.some((e) =>
                e.code === PUBLISH_ENTRY_STAGE_UNRESOLVABLE || e.code === PUBLISH_ENTRY_INTENT_UNKNOWN,
            ),
        ).toBe(false);
    });

    it("duplicate intent definitions are structurally impossible, and survive a round trip", () => {
        // `by_intent` is object-keyed, so one intent cannot be mapped twice — the last write wins at
        // JSON parse time and no tie-break rule is ever needed.
        const payload = revisionPayload();
        const parsed = parseLifecycleBuilderV1(payload)!;
        expect(Object.keys(parsed.processes[0].entry_points_v1!.by_intent).sort()).toEqual([
            "create_lead",
            "enrollment_start",
        ]);

        // 7 + 8. The mapping is part of the payload, so a published revision carries it immutably and
        // a rollback — which republishes a prior payload forward — restores exactly what it held.
        const roundTripped = parseLifecycleBuilderV1(serializeLifecycleBuilderV1(parsed))!;
        expect(roundTripped.processes[0].entry_points_v1).toEqual(parsed.processes[0].entry_points_v1);
    });
});

describe("D-103 — Create Lead is not dragged into the Start Enrollment stage", () => {
    it("a create_lead journey resolves `lead` at runtime, where no participant packet lives", async () => {
        __clearConfigReadCacheForTests();
        const db = makeDb(revisionPayload());
        const supabase = client(db);

        // Exactly what Create Lead child persistence does: the same canonical creator, its own
        // provenance, and no stage — the family track decides position later.
        const created = await createEnrollmentProcessInstance(supabase, {
            orgId: ORG,
            subjectId: CHILD,
            stageKey: null,
            state: null,
            source: "create_lead",
        });
        expect(created.error, created.error ?? "").toBeUndefined();

        const instance = db.process_instances.find((r) => r.id === created.id)!;
        expect((instance.metadata as { source?: string }).source).toBe("create_lead");
        expect(instance.stage_key ?? null).toBeNull();

        const progress = await resolveEnrollmentParticipantProgress(supabase, {
            orgId: ORG,
            processInstanceId: String(created.id),
        });
        expect(progress.ok, progress.ok ? "" : progress.refusal.detail).toBe(true);
        if (!progress.ok) return;

        // THE REGRESSION. Under the process-global scalar this journey resolved `enrolling` and
        // would have projected the participant Form requirement at the top of the acquisition
        // funnel. It resolves `lead`, which requires no Forms, so it projects none.
        expect(progress.value.stage_key).toBe("lead");
        expect(progress.value.requirements).toEqual([]);
    });

    it("a Start Enrollment journey in the same tenant still resolves `enrolling`", async () => {
        const { db, result } = await startWithConfig(revisionPayload());
        const instance = db.process_instances.find((r) => r.id === result.processInstanceId)!;
        expect((instance.metadata as { source?: string }).source).toBe("enrollment_start");

        expect(result.participantLaunch.realized).toBe(true);
        if (!result.participantLaunch.realized) return;
        // 9. and its packet was realized from that stage's requirements.
        expect(result.participantLaunch.value.stageKey).toBe("enrolling");
        expect(db.form_packet_items).toHaveLength(1);
        expect(db.form_packet_items[0].form_definition_id).toBe(FORM_A);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3–8. Requirement-derived packet
// ─────────────────────────────────────────────────────────────────────────────

describe("B1 — the packet is derived from Business Process Form requirements", () => {
    it("3. a stage with zero Form requirements realizes no packet at all", async () => {
        // Authored-empty (D-90: the process HAS spoken — it requires nothing).
        const { db, result } = await startWithConfig(revisionPayload({ requirements: [] }));
        expect(result.processInstanceId).toBeTruthy();
        expect(result.participantLaunch.realized).toBe(false);
        expect(!result.participantLaunch.realized && result.participantLaunch.code).toBe("no_form_requirements");

        // Nothing was invented to fill the gap.
        expect(db.form_packet_definitions).toHaveLength(0);
        expect(db.form_packet_sessions).toHaveLength(0);
        expect(db.form_public_links).toHaveLength(0);
    });

    it("3b. field-only requirements are not Form requirements", () => {
        const builder = parseLifecycleBuilderV1(
            revisionPayload({
                requirements: [
                    { requirement_id: "f1", kind: "field", rule_id: "child:first_name", level: "required" },
                    { requirement_id: "d1", kind: "document", document_type_key: "immunization", level: "required" },
                ],
            }),
        )!;
        const plan = planRequirementDerivedPacket({
            builder,
            processKey: "enrollment",
            stageKey: "enrolling",
        });
        expect(plan.steps).toEqual([]);
    });

    it("4. one Form requirement realizes exactly one packet step", async () => {
        const { db, result } = await startWithConfig(revisionPayload());
        expect(
            result.participantLaunch.realized,
            result.participantLaunch.realized
                ? ""
                : `${result.participantLaunch.code}: ${result.participantLaunch.detail}`,
        ).toBe(true);

        expect(db.form_packet_definitions).toHaveLength(1);
        const items = db.form_packet_items;
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ sequence_index: 0, form_definition_id: FORM_A });
    });

    it("5. multiple Form requirements realize exactly the expected steps, in authored order", async () => {
        const { db, result } = await startWithConfig(
            revisionPayload({
                requirements: [
                    formRequirement("r2", FORM_B),
                    { requirement_id: "f1", kind: "field", rule_id: "child:first_name", level: "required" },
                    formRequirement("r1", FORM_A),
                ],
            }),
        );
        expect(result.participantLaunch.realized).toBe(true);

        const items = [...db.form_packet_items].sort(
            (a, b) => (a.sequence_index as number) - (b.sequence_index as number),
        );
        // Authored order, not sorted, not de-duplicated by form id, and the field requirement is
        // simply not a step.
        expect(items.map((i) => i.form_definition_id)).toEqual([FORM_B, FORM_A]);
        expect(items.map((i) => i.sequence_index)).toEqual([0, 1]);
    });

    it("6. packet identity and contents come from the requirements", async () => {
        const { db } = await startWithConfig(revisionPayload());
        const def = db.form_packet_definitions[0];

        expect(def.key).toBe(requirementDerivedPacketKey(REVISION, "enrolling"));
        expect(def.metadata).toMatchObject({
            derived_from: "business_process_requirements",
            business_process_revision_id: REVISION,
            stage_key: "enrolling",
            requirement_ids: ["r1"],
        });
    });

    it("7. a step added to the packet by hand cannot become an Enrollment requirement", async () => {
        const { db, supabase } = await startWithConfig(revisionPayload());
        const def = db.form_packet_definitions[0];

        // Somebody edits the derived packet in the composer.
        db.form_packet_items.push({
            id: "smuggled",
            org_id: ORG,
            packet_definition_id: def.id,
            sequence_index: 1,
            form_definition_id: FORM_B,
            metadata: {},
        });

        // A fresh journey through the same requirements refuses rather than adopting the edit.
        db.form_packet_sessions.length = 0;
        const second = await launchParticipantEnrollment(supabase, {
            orgId: ORG,
            processInstanceId: String(db.process_instances[0].id),
        });
        expect(second.ok).toBe(false);
        expect(!second.ok && second.refusal.code).toBe("packet_drift");
    });

    it("8. D-94 pins Form versions at session realization, never on the requirement", async () => {
        const { db, result } = await startWithConfig(revisionPayload());
        expect(result.participantLaunch.realized).toBe(true);

        // The requirement projection stores no version identity.
        expect(db.form_packet_items[0].pinned_form_definition_version_id).toBeNull();
        // The session item carries the concrete published version.
        const sessionItems = db.form_packet_session_items;
        expect(sessionItems.length).toBeGreaterThan(0);
        expect(sessionItems[0].resolved_form_definition_version_id).toBe(VERSION_A);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9–14. Reachability
// ─────────────────────────────────────────────────────────────────────────────

describe("B1 — the participant becomes reachable", () => {
    it("9-13. Start Enrollment yields a token that resolves an anchored objective", async () => {
        const { db, supabase, result } = await startWithConfig(revisionPayload());

        // 9. the process instance exists, created by this start.
        expect(db.process_instances).toHaveLength(1);
        expect(db.process_instances[0].id).toBe(result.processInstanceId);
        expect(result.reused).toBe(false);

        // 10 + 11. one anchored session, carrying process_instance_id.
        expect(result.participantLaunch.realized).toBe(true);
        expect(db.form_packet_sessions).toHaveLength(1);
        expect(db.form_packet_sessions[0].process_instance_id).toBe(result.processInstanceId);

        // 12. the minted link is usable, and resolves THAT session.
        const path = result.participantLaunch.realized
            ? result.participantLaunch.value.participantPath
            : null;
        expect(path).toMatch(/^\/forms\/embed\//);
        const token = decodeURIComponent(String(path).slice("/forms/embed/".length));

        const access = await resolveParticipantEnrollmentFromToken(supabase, token);
        expect(access.ok, access.ok ? "" : access.error.code).toBe(true);
        if (!access.ok) return;
        expect(access.value.sessionId).toBe(String(db.form_packet_sessions[0].id));
        expect(access.value.processInstanceId).toBe(result.processInstanceId);

        // 13 + 14. the Participant Runtime objective resolves, which is exactly the condition
        // `FormEmbedClient` mounts `EnrollmentConversationCard` on.
        const objective = await resolveParticipantEnrollmentObjective(supabase, {
            orgId: access.value.orgId,
            processInstanceId: access.value.processInstanceId,
        });
        expect(objective.ok, objective.ok ? "" : objective.refusal.detail).toBe(true);
        if (!objective.ok) return;
        // The stage came from the DECLARED entry stage — the instance itself still has none, which
        // is the process-start semantic this slice preserved.
        expect(db.process_instances[0].stage_key ?? null).toBeNull();
        expect(objective.value.stage_key).toBe("enrolling");
        expect(objective.value.next_turn).toBeTruthy();

        // 14. `FormEmbedClient` mounts `EnrollmentConversationCard` when the objective endpoint
        // returns `{ok: true, data}` — this is that payload, so the card is reachable.
        const wire = participantObjectiveWireModel(objective.value);
        expect(wire).toBeTruthy();
        expect((wire as { next_turn?: unknown }).next_turn).toBeTruthy();
    });

    it("15. a second Start Enrollment duplicates no process, session or packet item", async () => {
        const { db, supabase, result } = await startWithConfig(revisionPayload());
        const firstSession = String(db.form_packet_sessions[0].id);
        const itemCount = db.form_packet_items.length;

        const again = await startEnrollment(supabase, { orgId: ORG, customerMemberId: CHILD });

        expect(again.processInstanceId).toBe(result.processInstanceId);
        expect(db.process_instances).toHaveLength(1);
        expect(db.form_packet_sessions).toHaveLength(1);
        expect(db.form_packet_sessions[0].id).toBe(firstSession);
        expect(db.form_packet_items).toHaveLength(itemCount);
        expect(db.form_packet_definitions).toHaveLength(1);

        expect(again.participantLaunch.realized).toBe(true);
        if (!again.participantLaunch.realized) return;
        expect(again.participantLaunch.value.outcome).toBe("resumed");
        expect(again.participantLaunch.value.sessionId).toBe(firstSession);
    });

    it("16. the resumed launch returns the SAME access link, not a second one", async () => {
        const { db, supabase } = await startWithConfig(revisionPayload());
        const link = db.form_public_links[0];
        const originalPath = readShareEmbedPath(link.metadata);
        expect(originalPath, "the participant link must be retrievable").toBeTruthy();

        const again = await startEnrollment(supabase, { orgId: ORG, customerMemberId: CHILD });

        // No second link, and the same usable URL — a new access token must never imply a new
        // participant objective.
        expect(db.form_public_links).toHaveLength(1);
        expect(again.participantLaunch.realized).toBe(true);
        if (!again.participantLaunch.realized) return;
        expect(again.participantLaunch.value.publicLinkId).toBe(link.id);
        expect(again.participantLaunch.value.participantPath).toBe(originalPath);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17–20. Isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("B1 — republishing and unrelated links are unaffected", () => {
    it("17. a BP republish does not alter an already-running Enrollment", async () => {
        const { db, supabase, result } = await startWithConfig(revisionPayload());
        const before = {
            packetKey: db.form_packet_definitions[0].key,
            steps: db.form_packet_items.map((i) => i.form_definition_id),
            sessionId: db.form_packet_sessions[0].id,
        };

        // A new revision requires a different Form. The running journey stays pinned to its own.
        __clearConfigReadCacheForTests();
        db.business_process_revisions.push({
            id: "99999999-9999-4999-8999-999999999999",
            org_id: ORG,
            payload: revisionPayload({ requirements: [formRequirement("r9", FORM_B)] }),
        });

        const again = await launchParticipantEnrollment(supabase, {
            orgId: ORG,
            processInstanceId: String(result.processInstanceId),
        });

        expect(again.ok).toBe(true);
        expect(db.form_packet_definitions).toHaveLength(1);
        expect(db.form_packet_definitions[0].key).toBe(before.packetKey);
        expect(db.form_packet_items.map((i) => i.form_definition_id)).toEqual(before.steps);
        expect(db.form_packet_sessions[0].id).toBe(before.sessionId);
    });

    it("18. publishing a new Form version does not move an already-pinned session item", async () => {
        const { db, supabase } = await startWithConfig(revisionPayload());
        expect(db.form_packet_session_items[0].resolved_form_definition_version_id).toBe(VERSION_A);

        // The org publishes a newer version of the very Form this session pinned.
        db.form_definition_versions.push({
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            org_id: ORG,
            form_definition_id: FORM_A,
            status: "published",
            version_number: 2,
            schema_json: { fields: [] },
        });

        // Touching the journey again must not re-pin. D-94 resolves a version ONCE, at realization;
        // a resumed launch that re-pinned would change the artifact under a parent mid-packet.
        const resumed = await launchParticipantEnrollment(supabase, {
            orgId: ORG,
            processInstanceId: String(db.process_instances[0].id),
        });
        expect(resumed.ok).toBe(true);
        expect(db.form_packet_session_items).toHaveLength(1);
        expect(db.form_packet_session_items[0].resolved_form_definition_version_id).toBe(VERSION_A);
    });

    it("19. a context-free child journey needs no Opportunity", async () => {
        const { db, result } = await startWithConfig(revisionPayload());

        expect(result.opportunityId).toBeNull();
        expect(result.contextOutcome).toBe("context_free");
        expect(db.opportunities).toHaveLength(0);
        /*
         * NO OPPORTUNITY, AND STILL A REAL CONTEXT.
         *
         * The journey used to carry no context pair at all here, because the only context shape it
         * had was an Opportunity and there wasn't one. It now anchors to the child's Enrollment
         * Participation, which exists in both paths — so "context-free" describes the ACQUISITION,
         * not the journey, and every consumer gets the same shape either way.
         *
         * The type is asserted alongside the id on purpose: an OCM id sitting under `opportunity`
         * would satisfy a bare non-null check while being precisely the confusion this converges.
         */
        const instance = db.process_instances[0];
        expect(instance.context_type).toBe("enrollment_participation");
        expect(instance.context_id).toBe(result.enrollmentParticipationId);
        expect(instance.context_id).not.toBeNull();
        // And the participant is still reachable.
        expect(result.participantLaunch.realized).toBe(true);
    });

    it("20. an ordinary non-Enrollment public form link is untouched", async () => {
        const { db, supabase } = await startWithConfig(revisionPayload());

        // A plain form link with no packet session, exactly as it existed before this slice.
        db.form_public_links.push({
            id: "legacy-link",
            org_id: ORG,
            form_definition_id: FORM_B,
            token_hash: "legacy-hash",
            token_prefix: "legacy",
            is_active: true,
            expires_at: null,
            allowed_embed_origins: null,
            metadata: {},
        });

        const { hashFormLinkToken } = await import("@/lib/public/forms/tokenHash");
        db.form_public_links[db.form_public_links.length - 1].token_hash = hashFormLinkToken("legacy-token");

        const access = await resolveParticipantEnrollmentFromToken(supabase, "legacy-token");
        // The existing taxonomy, unchanged: it is a valid form link that realizes no Enrollment
        // journey — NOT an invalid link, and not an error.
        expect(access.ok).toBe(false);
        expect(!access.ok && access.error.code).toBe("NO_SESSION");
    });
});
