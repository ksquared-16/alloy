import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
    ACTIONABLE_DRAWER_CARRIER_VERSION,
    actionableCarrierDescribesSubject,
    buildActionableDrawerCarrier,
    carrierActionIsExecutable,
    classifyActionableCarrierReadiness,
    type CarrierActionReadiness,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrier";
import {
    clearActionableDrawerCarriersForTests,
    peekActionableDrawerCarrier,
    publishActionableDrawerCarrier,
    retireActionableDrawerCarrier,
    subscribeToActionableDrawerCarriers,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrierStore";
import { emptyResolvedActionsBySlot, type ResolvedActionForClient } from "@/lib/admin/actions/types";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const action = (over: Partial<ResolvedActionForClient>): ResolvedActionForClient => ({
    key: "k",
    label: "L",
    description: null,
    action_type: "mutation_command",
    icon: null,
    style: null,
    display_style: "button",
    payload: {},
    workflow_id: null,
    ...over,
});

/**
 * THE CENSUS, VERBATIM.
 *
 * Every row below was read off the wire on deployed staging from the Opportunity / New Leads
 * surface this programme measures — the `header_menu` the resolver actually produced, not the action
 * LIBRARY. Auditing the library would have classified actions no operator can reach and missed the
 * ones they can: `update_status_add_note` is catalogued with `defaultSurface: "queue_row"` and is on
 * this header; `send_tour_invitation` is catalogued as a working communication action and reaches
 * no handler branch at all.
 *
 * The expected readiness beside each was derived by tracing that action's own path through
 * `applyRegistryResolvedActionClient` and then through whatever modal that path opens — never from
 * the action's name, label or category.
 */
const CENSUS: Array<{ a: ResolvedActionForClient; expect: CarrierActionReadiness; why: string }> = [
    {
        a: action({ key: "update_lead_status", action_type: "mutation_command", payload: { domain: "status" } }),
        expect: "CARRIER_SAFE",
        why: "default branch: POST /api/admin/actions/execute with action_key, entity_type, entity_id, context",
    },
    {
        a: action({ key: "close_lead", action_type: "mutation_command", payload: { domain: "status" } }),
        expect: "CARRIER_SAFE",
        why: "same default branch",
    },
    {
        a: action({ key: "quick_message", action_type: "ui_intent", payload: { intent: "quick_message" } }),
        expect: "CARRIER_SAFE",
        why: "launchContextualQuickMessage takes the opportunity id, department and work unit — all carried",
    },
    {
        a: action({
            key: "add_family_member",
            action_type: "open_form",
            payload: { form_key: "add_family_member", required_fields: [] },
        }),
        expect: "CARRIER_SAFE",
        why: "AddPersonModal submits {entityId, actionKey, payload, context} and reads no drawer record",
    },
    {
        a: action({
            key: "schedule_tour",
            action_type: "open_form",
            payload: { form_key: "schedule_tour", required_fields: [] },
        }),
        expect: "FULL_DRAWER_REQUIRED",
        why: "OpportunityTourScheduleActionModal needs locationId from record.location_id",
    },
    {
        a: action({
            key: "change_lead_location",
            action_type: "ui_intent",
            payload: { form_key: "change_lead_location", grain: "family" },
        }),
        expect: "FULL_DRAWER_REQUIRED",
        why: "ChangeLeadLocationModal takes record={record}",
    },
    {
        a: action({
            key: "add_child",
            action_type: "open_form",
            payload: { form_key: "add_inquiry_child", mode: "child" },
        }),
        expect: "FULL_DRAWER_REQUIRED",
        why: "submit reads record.customer_id and record._inquiry_children",
    },
    {
        a: action({ key: "create_task", action_type: "ui_intent", payload: { intent: "create_task" } }),
        expect: "FULL_DRAWER_REQUIRED",
        why: "OpportunityRecordCreateWorkModal needs lifecycleStageKey and recordOwnerUserId from the record",
    },
    {
        a: action({ key: "send_form", action_type: "ui_intent", payload: { intent: "send_form" } }),
        expect: "CARRIER_VISIBLE_DISABLED",
        why: "SendFormToOpportunityModal names the family from record._customer_name",
    },
    {
        a: action({
            key: "send_tour_invitation",
            action_type: "ui_intent",
            payload: { intent: "send_tour_invitation" },
        }),
        expect: "CARRIER_VISIBLE_DISABLED",
        why: "no handler branch — reaches the explicit 'nothing was executed' refusal",
    },
    {
        a: action({
            key: "update_status_add_note",
            action_type: "open_form",
            payload: { form_key: "update_status_add_note" },
        }),
        expect: "CARRIER_VISIBLE_DISABLED",
        why: "generic openForm whose form_key matches none of the three mounted form hosts",
    },
];

describe("actionable drawer carrier — per-action classification", () => {
    for (const row of CENSUS) {
        it(`${row.a.key} is ${row.expect} — ${row.why}`, () => {
            expect(classifyActionableCarrierReadiness(row.a)).toBe(row.expect);
        });
    }

    it("the measured surface yields a REAL early command set, not an empty one", () => {
        // If every action classified unsafe the architecture would be pure cost. Four of eleven are
        // executable from phase-1 authority, and both status-lifecycle commands — the operator's
        // actual work on New Leads — are among them.
        const safe = CENSUS.filter((r) => r.expect === "CARRIER_SAFE").map((r) => r.a.key);
        expect(safe).toEqual(["update_lead_status", "close_lead", "quick_message", "add_family_member"]);
    });

    it("the FIRST header action is carrier-safe — the one the header offers as primary", () => {
        expect(classifyActionableCarrierReadiness(CENSUS[0]!.a)).toBe("CARRIER_SAFE");
    });

    it("AN ACTION IS NOT SAFE BECAUSE IT EXISTS — an unknown record-reading key stays unsafe", () => {
        expect(classifyActionableCarrierReadiness(action({ key: "add_sibling", action_type: "open_form", payload: { form_key: "add_sibling" } })))
            .toBe("FULL_DRAWER_REQUIRED");
        expect(classifyActionableCarrierReadiness(action({ key: "make_primary_contact" })))
            .toBe("FULL_DRAWER_REQUIRED");
        expect(classifyActionableCarrierReadiness(action({ key: "assign_classroom", action_type: "ui_intent", payload: { intent: "assign_classroom" } })))
            .toBe("FULL_DRAWER_REQUIRED");
    });

    it("an unrecognised open_form is never offered early — the host it opens is unknown", () => {
        expect(classifyActionableCarrierReadiness(action({ key: "zzz", action_type: "open_form", payload: { form_key: "something_new" } })))
            .toBe("CARRIER_VISIBLE_DISABLED");
    });

    it("the record-reading rules are tested BEFORE the safe default, as the handler tests them", () => {
        // `change_lead_location` arrives as a ui_intent with no `intent` — only its form_key marks
        // it. Classified in the wrong order it would fall through to the safe default and offer an
        // action whose modal renders nothing.
        expect(classifyActionableCarrierReadiness(action({ key: "change_lead_location", action_type: "ui_intent", payload: { form_key: "change_lead_location" } })))
            .toBe("FULL_DRAWER_REQUIRED");
    });
});

describe("actionable drawer carrier — shape and refusal", () => {
    const resolved = () => ({
        ...emptyResolvedActionsBySlot(),
        primary: [CENSUS[0]!.a],
        secondary: [CENSUS[4]!.a],
    });

    it("carries the resolver's own actions, in the resolver's own order, each classified", () => {
        const c = buildActionableDrawerCarrier({
            opportunityId: "opp-1",
            attentionSubjectId: null,
            departmentId: "dept-1",
            workUnitId: "wu-1",
            resolved: resolved(),
            flushedAtMs: 391,
        });
        // `change_lead_location` is appended by the SAME builder the view model uses — a platform
        // guarantee, not a resolved action. Phase 1 must carry it or phase 2 would insert a command
        // into a menu the operator had already read.
        expect(c?.header_menu.map((a) => [a.key, a.readiness])).toEqual([
            ["update_lead_status", "CARRIER_SAFE"],
            ["schedule_tour", "FULL_DRAWER_REQUIRED"],
            ["change_lead_location", "FULL_DRAWER_REQUIRED"],
        ]);
        expect(c?.execution).toEqual({ department_id: "dept-1", work_unit_id: "wu-1", surface: "record_header" });
        expect(c?.subject).toEqual({
            entity_type: "opportunity",
            opportunity_id: "opp-1",
            attention_subject_id: null,
        });
    });

    it("THE ACTION IS CARRIED VERBATIM — a projected subset would be a shadow command model", () => {
        const c = buildActionableDrawerCarrier({
            opportunityId: "opp-1",
            attentionSubjectId: null,
            departmentId: "dept-1",
            workUnitId: null,
            resolved: resolved(),
            flushedAtMs: 1,
        });
        const carried = c!.header_menu[1]!;
        // The handler dispatches on every one of these; dropping one changes what a click means.
        expect(carried.action_type).toBe("open_form");
        expect(carried.payload).toEqual({ form_key: "schedule_tour", required_fields: [] });
    });

    it("A REJECTED RESOLUTION IS NOT AN EMPTY CARRIER — it is no carrier", () => {
        expect(
            buildActionableDrawerCarrier({
                opportunityId: "opp-1",
                attentionSubjectId: null,
                departmentId: "dept-1",
                workUnitId: null,
                resolved: null,
                flushedAtMs: 1,
            }),
        ).toBeNull();
    });

    it("no subject, no carrier", () => {
        expect(
            buildActionableDrawerCarrier({
                opportunityId: "   ",
                attentionSubjectId: null,
                departmentId: "dept-1",
                workUnitId: null,
                resolved: resolved(),
                flushedAtMs: 1,
            }),
        ).toBeNull();
    });
});

describe("actionable drawer carrier — subject guard fails closed", () => {
    const carrier = buildActionableDrawerCarrier({
        opportunityId: "opp-B",
        attentionSubjectId: null,
        departmentId: "dept-1",
        workUnitId: "wu-1",
        resolved: { ...emptyResolvedActionsBySlot(), primary: [CENSUS[0]!.a] },
        flushedAtMs: 1,
    })!;

    it("accepts the subject it describes", () => {
        expect(actionableCarrierDescribesSubject(carrier, { opportunityId: "opp-B" })).toBe(true);
    });

    it("A LATE B CARRIER CANNOT MOUNT UNDER C", () => {
        expect(actionableCarrierDescribesSubject(carrier, { opportunityId: "opp-C" })).toBe(false);
    });

    it("THE LENS IS NOT IDENTITY — and making it identity is what broke the deployed reader", () => {
        /*
         * Deployed 8e749e03 keyed the carrier on (opportunity, lens). The hover prewarm calls
         * `prewarmRecordWork(opportunity, id)` with the queue row's own id, so on a family row it
         * asserts the opportunity id as the attention subject; the panel asserts none. Every
         * hover-warmed carrier was therefore refused by the only consumer that needed it —
         * `T_carrier_mounted` absent from every sample while the carrier arrived at click +164ms.
         *
         * It cannot be identity: `resolveActionsForContext` receives org, surface, entity,
         * department and work unit and NO participation, so one opportunity has one header action
         * set whatever lens asked for it. The lens is echoed for diagnosis and nothing keys on it.
         */
        const childLens = buildActionableDrawerCarrier({
            opportunityId: "opp-B",
            attentionSubjectId: "child-1",
            departmentId: "dept-1",
            workUnitId: null,
            resolved: { ...emptyResolvedActionsBySlot(), primary: [CENSUS[0]!.a] },
            flushedAtMs: 1,
        })!;
        expect(childLens.subject.attention_subject_id).toBe("child-1");
        for (const lens of ["child-1", "child-2", null, undefined]) {
            expect(
                actionableCarrierDescribesSubject(childLens, { opportunityId: "opp-B", attentionSubjectId: lens }),
                `a carrier for opp-B must be readable however the consumer names its lens (${String(lens)})`,
            ).toBe(true);
        }
        // The guard that matters is unchanged: a different opportunity is still refused.
        expect(actionableCarrierDescribesSubject(childLens, { opportunityId: "opp-C" })).toBe(false);
    });

    it("malformed, truncated and unversioned carriers all refuse", () => {
        for (const bad of [
            null,
            undefined,
            {},
            "a string",
            { ...carrier, carrier_version: 99 },
            { ...carrier, header_menu: undefined },
            { ...carrier, execution: undefined },
            { ...carrier, subject: { entity_type: "child", opportunity_id: "opp-B" } },
        ]) {
            expect(actionableCarrierDescribesSubject(bad, { opportunityId: "opp-B" })).toBe(false);
        }
    });

    it("no selected subject means nothing to match against", () => {
        expect(actionableCarrierDescribesSubject(carrier, { opportunityId: null })).toBe(false);
    });

    it("the version is pinned — an unrecognised one waits for phase 2 rather than guessing", () => {
        expect(ACTIONABLE_DRAWER_CARRIER_VERSION).toBe(1);
    });
});

describe("actionable drawer carrier store", () => {
    beforeEach(() => clearActionableDrawerCarriersForTests());

    const mk = (id: string) =>
        buildActionableDrawerCarrier({
            opportunityId: id,
            attentionSubjectId: null,
            departmentId: "dept-1",
            workUnitId: "wu-1",
            resolved: { ...emptyResolvedActionsBySlot(), primary: [CENSUS[0]!.a] },
            flushedAtMs: 1,
        })!;

    it("hands back only the subject asked for", () => {
        publishActionableDrawerCarrier(mk("opp-B"));
        expect(peekActionableDrawerCarrier({ opportunityId: "opp-B" })?.subject.opportunity_id).toBe("opp-B");
        expect(peekActionableDrawerCarrier({ opportunityId: "opp-C" })).toBeNull();
    });

    it("HOVER B, CLICK C — B's warmed carrier is never the answer for C", () => {
        publishActionableDrawerCarrier(mk("opp-B"));
        expect(peekActionableDrawerCarrier({ opportunityId: "opp-C" })).toBeNull();
    });

    it("phase 2 retires the carrier — a superseded action set must stop being readable", () => {
        publishActionableDrawerCarrier(mk("opp-B"));
        retireActionableDrawerCarrier("opp-B", null);
        expect(peekActionableDrawerCarrier({ opportunityId: "opp-B" })).toBeNull();
    });

    it("retiring one subject leaves another alone", () => {
        publishActionableDrawerCarrier(mk("opp-B"));
        publishActionableDrawerCarrier(mk("opp-C"));
        retireActionableDrawerCarrier("opp-B", null);
        expect(peekActionableDrawerCarrier({ opportunityId: "opp-C" })).not.toBeNull();
    });

    it("is bounded — a session of switching cannot grow it without limit", () => {
        for (let i = 0; i < 40; i += 1) publishActionableDrawerCarrier(mk(`opp-${i}`));
        const alive = Array.from({ length: 40 }, (_, i) => peekActionableDrawerCarrier({ opportunityId: `opp-${i}` })).filter(Boolean);
        expect(alive.length).toBeLessThanOrEqual(8);
    });

    it("notifies subscribers on publish and on retire", () => {
        const seen = vi.fn();
        const stop = subscribeToActionableDrawerCarriers(seen);
        publishActionableDrawerCarrier(mk("opp-B"));
        retireActionableDrawerCarrier("opp-B", null);
        stop();
        expect(seen).toHaveBeenCalledTimes(2);
    });
});

/**
 * PLANT 1 (Part 15) and PLANT 2 (Part 16), as source coupling.
 *
 * Both plants describe the same regression from two directions: a carrier that is produced and
 * transported but never mounted. This programme has already shipped one write-only store and had to
 * certify it out, so the producer's only defence is a reader that fails loudly when it is removed.
 */
describe("the carrier has a REAL mounted consumer", () => {
    const PANEL = read("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx");
    const RAIL = read("components/admin/focusPanel/FocusPanelCarrierActionRail.tsx");

    it("PLANT 2 — the identity-safe header mounts carrier actions", () => {
        // Removing this prop, or reverting it to `null`, is Plant 2: producer and transport intact,
        // no reader. It must fail here.
        expect(PANEL).toContain("secondaryActions={");
        expect(PANEL).toContain("<FocusPanelCarrierActionRail");
        expect(PANEL).toContain("carrier={carrier}");
    });

    it("PLANT 1 — header actions do NOT wait for the resolved view model", () => {
        // Restoring full-drawer coupling means the carrier branch disappears from the unresolved
        // header. The consumer is inside the `: <FocusPanelCompactHeader` arm — the one rendered
        // when `visible` is null — which is precisely the frame that used to carry no commands.
        const compact = PANEL.slice(PANEL.indexOf(": <FocusPanelCompactHeader"));
        expect(compact.indexOf("FocusPanelCarrierActionRail")).toBeGreaterThan(-1);
        expect(compact.indexOf("FocusPanelCarrierActionRail")).toBeLessThan(compact.indexOf("</div>"));
    });

    it("the carrier is asked for by the COMMITTED subject, never by last-arrival", () => {
        expect(PANEL).toContain("useActionableDrawerCarrier({ opportunityId: settlementSubjectId })");
    });

    it("phase 2 wins outright — a resolved view model is never topped up from a carrier", () => {
        expect(PANEL).toContain("displayVm ? displayVm.workspace");
    });

    it("NO SYNTHETIC overviewData — the rail has nowhere to put one", () => {
        // Comments stripped first: this file's own prose explains WHY it takes no `overviewData`,
        // and matching that sentence would fail the assertion for describing the property it asserts.
        const code = RAIL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(code).not.toContain("overviewData");
        expect(code).not.toContain("OpportunityDrawerHeaderControls");
    });

    it("the rail uses the canonical menu and the canonical selection handler — no second command model", () => {
        expect(RAIL).toContain("RecordDrawerManageMenu");
        expect(RAIL).toContain("onRegistryActionSelect={onActionSelect}");
        expect(RAIL).not.toContain("fetch(");
    });
});

/**
 * PLANT 3 (Part 17) — STEP 1'S DUPLICATE-RESOLVER PLANT, PRESERVED.
 *
 * Phase-2 convergence is a tautology only while both phases quote ONE resolver answer. If a second
 * `resolveActionsForContext` were reintroduced the two phases could legitimately disagree, and every
 * convergence guarantee below it would become a coincidence.
 */
describe("one resolveActionsForContext per drawer lifecycle — still", () => {
    it("the first-paint resolver reuses the threaded promise", () => {
        const FP = read("lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityDrawerFirstPaintDependencies.ts");
        expect(FP).toContain("params.earlyHeaderActions ?? resolveActionsForContext(");
    });

    it("the carrier publishes from that SAME promise, and does not resolve its own", () => {
        const SHARED = read("lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts");
        expect(SHARED.match(/resolveActionsForContext\(/g)?.length).toBe(1);
        expect(SHARED).toContain("void earlyHeaderActions.then(");
    });

    it("A REJECTION IS STILL A REJECTION — the publisher never converts one to an empty set", () => {
        const SHARED = read("lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts");
        // The rejection arm must publish nothing. A `publish(` inside it would make a failed
        // resolution look like an authoritative empty action set to every early consumer.
        const block = SHARED.slice(SHARED.indexOf("void earlyHeaderActions.then("));
        const rejectionArm = block.slice(block.indexOf("() => {"), block.indexOf(");", block.indexOf("() => {")));
        expect(rejectionArm).not.toContain("publish(");
        // And the promise itself is still never caught, so the real consumer still sees the failure.
        expect(SHARED).not.toContain("earlyHeaderActions.catch(");
    });

    it("THE CARRIER'S DEPARTMENT IS THE VIEW MODEL'S DEPARTMENT — same row, not a second read", () => {
        const SHARED = read("lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts");
        /*
         * This is the load-bearing convergence claim, and it rests on one fact: the early department
         * and the composed one read the SAME work-unit row.
         *
         *   earlyDepartmentId = ctxDept || earlyWu.department_id
         *   departmentId      = ctxDept || wuData.department_id || record._work_unit_department_id
         *
         * with `earlyWu` and `wuData` both being `wuRes.data`. They can therefore differ in exactly
         * one case — the third fallback supplying what the first two did not — and in that case
         * `earlyDepartmentId` is null, no early resolve runs and no carrier is published at all.
         * If either ever read a different row this would stop being true silently.
         */
        expect(SHARED).toContain("const earlyWu = (wuRes.data ?? null)");
        expect(SHARED).toContain("const wuData = wuRes.data as {");
        expect(SHARED).toContain("const earlyDepartmentId = ctxDept || trimOrNull(earlyWu?.department_id) || null;");
        expect(SHARED).toContain("ctxDept ||\n        trimOrNull(wuData?.department_id) ||");
        // And the work unit is the single value this compose resolved, quoted by both.
        expect(SHARED).toContain("workUnitId: workUnitId || null });");
    });

    it("THE SIDE CHANNEL MAY NEVER COST THE DRAWER ANYTHING", () => {
        const SHARED = read("lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts");
        /*
         * `then(onOk, onErr)`'s second arm handles the ORIGINAL promise's rejection — not a throw
         * from the first arm, which would reject the derived promise with nobody listening. Phase 1
         * failing to be delivered must cost the operator earliness and nothing else, so the publish
         * call is guarded in its own right.
         */
        const arm = SHARED.slice(SHARED.indexOf("void earlyHeaderActions.then("));
        const fulfil = arm.slice(0, arm.indexOf("            () => {"));
        expect(fulfil).toContain("try {");
        expect(fulfil).toContain("publish({ resolved,");
        expect(fulfil).toContain("} catch {");
    });

    it("UNRESOLVED DEPARTMENT CANNOT PRODUCE A WRONG ACTION SET", () => {
        const SHARED = read("lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts");
        // Publishing is gated on the department being known, and the published type says so.
        expect(SHARED).toContain("if (earlyHeaderActions && earlyDepartmentId && params.onEarlyHeaderActions)");
        expect(SHARED).toContain("departmentId: string;");
    });
});
