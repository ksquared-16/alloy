import { describe, expect, it } from "vitest";

import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import {
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    reconcileNestedSurfaceConfig,
    setNestedGroupEnabled,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/**
 * IS `metadata.nestedSurfaces` FIRST-ORDER? — REMOVAL SIMULATION (P0-7.6).
 *
 * The standing ruling is that FOCUS PANEL SUMMARY CARDS ARE FIRST_ORDER_REQUIRED. It does not
 * follow that every byte travelling inside `focusPanelSummaryDoc` is: 23,199 of that doc's 28,033
 * bytes are nested-surface field-selection CONFIG, and the question is which of it the collapsed
 * first-order face actually consumes.
 *
 * The question is settled by REMOVAL, not by field names. Each candidate is stripped from the
 * published config, the evidence is rebuilt, and the COLLAPSED projection is compared. A field
 * whose removal leaves the collapsed answer byte-identical is not first-order, whatever it is
 * called; a field whose removal changes it is first-order, however deep it sounds.
 *
 * NOT a latency argument. If the collapsed answer moves, the field stays — the target does not get
 * a vote.
 */

function ctx(truth: Record<string, unknown>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Household" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: {
            work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

const record = (): Record<string, unknown> => ({
    id: "opp-1",
    customer_id: "cust-1",
    updated_at: "2026-06-20T10:00:00Z",
    _customer_name: "Johnson Household",
    "person.primary_contact_name": "Sarah Johnson",
    "person.primary_phone": "555-123-4567",
    "person.primary_email": "sarah@example.com",
    "opportunity.primary_person_id": "p-sarah",
    _opportunity_persons: [
        { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson", phone: "555-123-4567", email: "sarah@example.com" },
        { person_id: "p-mike", role_type: "parent", name: "Michael Johnson", phone: "555-111-2222" },
        { person_id: "p-gran", role_type: "emergency_contact", name: "Grandma Mary", phone: "555-333-4444" },
        { person_id: "p-tom", role_type: "authorized_pickup", name: "Uncle Tom" },
        { person_id: "p-pay", role_type: "billing_contact", name: "Sarah Johnson" },
    ],
    _inquiry_children: [
        { id: "c1", display_name: "Emma Johnson", age: "6", outcome_status_label: "Enrolled" },
        { id: "c2", display_name: "Liam Johnson", age: "4" },
    ],
});

/** The collapsed face — every evidence field EXCEPT `groups`, which the type documents as expanded. */
const collapsed = (e: ReturnType<typeof buildHouseholdCardEvidence>) => {
    const { groups: _groups, ...rest } = e;
    return rest;
};

/**
 * The published baseline MUST produce non-zero counts in every bucket the controls disturb.
 *
 * The default config ships `emergency_contacts` and `authorized_pickups` DISABLED, which makes
 * their collapsed counts 0 — the same 0 that a fully-stripped config produces by filtering every
 * contact out. Two different mechanisms, one indistinguishable result: with the defaults, the
 * positive controls below silently compare 0 with 0 and every negative result is vacuous. Enabling
 * them is what gives the simulation the power to fail.
 */
const full = (): NestedSurfaceConfig => {
    let c = reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID));
    c = setNestedGroupEnabled(c, "emergency_contacts", true);
    c = setNestedGroupEnabled(c, "authorized_pickups", true);
    return c;
};

/** Strip one per-group key from every group, as omitting it from initial transport would. */
function withoutGroupKey(config: NestedSurfaceConfig, key: string): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((g) => {
            const next = { ...g } as Record<string, unknown>;
            delete next[key];
            return next as typeof g;
        }),
    };
}

describe("nestedSurfaces first-order contract, by removal", () => {
    it("THE GATE: the baseline counts are non-zero, so a control CAN fail", () => {
        // Without this, a stripped config and the baseline both read 0 and every negative result
        // below is a no-op. This is the assertion that makes the rest of the suite mean anything.
        const base = buildHouseholdCardEvidence(ctx(record()), { nestedConfig: full() });
        expect(base.emergencyContactCount).toBeGreaterThan(0);
        expect(base.authorizedPickupCount).toBeGreaterThan(0);
    });

    it("BASELINE: the simulation can detect a change at all", () => {
        // A removal test that cannot fail proves nothing. Dropping the groups outright MUST move
        // the collapsed answer, or every PASS below is a no-op.
        const base = buildHouseholdCardEvidence(ctx(record()), { nestedConfig: full() });
        const stripped = buildHouseholdCardEvidence(ctx(record()), {
            nestedConfig: { ...full(), groups: [] },
        });
        expect(collapsed(stripped)).not.toEqual(collapsed(base));
    });

    it("GROUP ENABLEMENT is first-order: disabling a section changes the collapsed counts", () => {
        // `if (nestedConfig && !sectionKey) continue` plus the section→bucket mapping decide which
        // contacts are COUNTED on the collapsed face. This is the specific fact that keeps
        // nestedSurfaces from being deferred wholesale.
        //
        // Stated as enabled-vs-disabled rather than config-vs-null on purpose: with every group
        // enabled the configured answer COINCIDES with the no-config fallback (both surface the
        // emergency contact and the pickup), so a config-vs-null comparison silently passes for a
        // reason that has nothing to do with the contract.
        const enabled = buildHouseholdCardEvidence(ctx(record()), { nestedConfig: full() });
        const disabled = buildHouseholdCardEvidence(ctx(record()), {
            nestedConfig: setNestedGroupEnabled(full(), "emergency_contacts", false),
        });
        expect(enabled.emergencyContactCount).toBe(1);
        expect(disabled.emergencyContactCount).toBe(0);
        expect(collapsed(disabled)).not.toEqual(collapsed(enabled));
    });

    // Each of these is a candidate for deferral. The assertion is the SAME in every case: the
    // collapsed face must not move. Any that fails is first-order and stays in initial transport.
    const CANDIDATES = [
        "fieldPlacements",
        "expandedFieldKeys",
        "evidenceCollections",
        "fieldPolicies",
        "fieldLayoutWidths",
        "fieldLayoutWidthsByPurpose",
        "displayOptions",
        "fieldModes",
        "contextFieldKeys",
        "selectedFieldKeys",
        "fieldLabels",
        "fieldIcons",
        "presentationRef",
        "definitionKey",
        "instanceKey",
    ] as const;

    for (const key of CANDIDATES) {
        it(`removing group.${key} leaves the collapsed first-order face unchanged`, () => {
            const base = buildHouseholdCardEvidence(ctx(record()), { nestedConfig: full() });
            const without = buildHouseholdCardEvidence(ctx(record()), {
                nestedConfig: withoutGroupKey(full(), key),
            });
            expect(collapsed(without)).toEqual(collapsed(base));
        });
    }

    it("the section IDENTITY fields are the first-order subset", () => {
        // Removing what drives bucketing MUST move the collapsed counts — the positive control for
        // the negative results above.
        const base = buildHouseholdCardEvidence(ctx(record()), { nestedConfig: full() });
        const noKeys = buildHouseholdCardEvidence(ctx(record()), {
            nestedConfig: {
                ...full(),
                groups: full().groups.map((g) => ({ ...g, key: `renamed_${g.key}` })),
            },
        });
        expect(collapsed(noKeys)).not.toEqual(collapsed(base));
    });
});
