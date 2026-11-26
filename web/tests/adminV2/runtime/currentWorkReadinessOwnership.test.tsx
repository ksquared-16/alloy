/**
 * Slice E — ownership-driven requirement grouping.
 *
 * Requirements group under the capability that OWNS them, sourced from runtime metadata
 * (readiness gap entity_type / config scope / field-rule entity) — never the display label.
 * Internal identifier fields (foreign keys) are suppressed. Owner grouping is process-agnostic:
 * a non-enrollment fixture and an unknown owner both work with no presentation branches.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ReadinessSummary } from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import { buildCurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import { resolveCurrentWorkRequirementOwner } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkRequirementOwner";
import { resolveCurrentWorkRequirementOperatorLabel } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkFieldRuleDisplayLabel";
import type { CurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";

vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({
        completeOutcome: vi.fn(async () => {}),
        busy: false,
        error: null,
        clearError: vi.fn(),
    }),
}));

describe("resolveCurrentWorkRequirementOwner", () => {
    it("derives owner from runtime metadata, not the label", () => {
        expect(resolveCurrentWorkRequirementOwner({ entityType: "child" })).toMatchObject({
            key: "children",
            label: "Children",
            card: "children",
        });
        expect(resolveCurrentWorkRequirementOwner({ entityType: "person" })).toMatchObject({
            key: "household",
            card: "household",
        });
        // entityType wins over scope when both are present.
        expect(resolveCurrentWorkRequirementOwner({ scope: "record", entityType: "child" }).card).toBe(
            "children",
        );
    });

    it("routes record/opportunity to Required information", () => {
        expect(resolveCurrentWorkRequirementOwner({ scope: "record" }).key).toBe("required_information");
        expect(resolveCurrentWorkRequirementOwner({ entityType: "opportunity" }).key).toBe(
            "required_information",
        );
        expect(resolveCurrentWorkRequirementOwner({}).key).toBe("required_information");
    });

    it("labels an unknown/new owner but leaves it non-navigable (no owning card)", () => {
        const owner = resolveCurrentWorkRequirementOwner({ entityType: "billing_account" });
        expect(owner.label).toBe("Billing Account");
        expect(owner.card).toBeNull();
    });
});

describe("resolveCurrentWorkRequirementOperatorLabel", () => {
    it("suppresses internal identifier fields", () => {
        expect(resolveCurrentWorkRequirementOperatorLabel("opportunity:location_id")).toBeNull();
        expect(resolveCurrentWorkRequirementOperatorLabel("custom:opportunity:location_id")).toBeNull();
        expect(resolveCurrentWorkRequirementOperatorLabel("id")).toBeNull();
    });

    it("resolves real operator fields (catalog + custom)", () => {
        expect(resolveCurrentWorkRequirementOperatorLabel("custom:opportunity:site_location")).toBe(
            "Site Location",
        );
        // A catalog-backed field keeps its curated label.
        expect(resolveCurrentWorkRequirementOperatorLabel("person:email")).toBe("Email");
    });
});

describe("ReadinessSummary owner grouping", () => {
    function surfaceWith(items: unknown[]): CurrentWorkSurfaceVM {
        return {
            readiness: {
                state: "in_progress",
                reasonCodes: [],
                reasonLabel: null,
                requirements: { complete: 0, total: items.length, remaining: items.length, items },
            },
        } as unknown as CurrentWorkSurfaceVM;
    }

    it("groups outstanding requirements by owner with a per-owner handoff", () => {
        const html = renderToStaticMarkup(
            <ReadinessSummary
                surface={surfaceWith([
                    {
                        key: "child:program",
                        label: "Program selection",
                        status: "missing",
                        owner: { key: "children", label: "Children", card: "children", focus: null },
                    },
                    {
                        key: "person:phone",
                        label: "Phone number",
                        status: "missing",
                        owner: { key: "household", label: "Household", card: "household", focus: null },
                    },
                ])}
                onNavigate={() => {}}
            />,
        );
        // Outer "still needed" block preserved; two owner groups inside.
        expect(html).toContain('data-work-readiness-group="still-needed"');
        expect(html).toContain('data-work-readiness-owner="children"');
        expect(html).toContain('data-work-readiness-owner="household"');
        expect(html).toContain("Program selection");
        expect(html).toContain("Phone number");
        // Per-owner handoff: the owner heading ITSELF is the navigation to its card (no separate
        // "Open X →" affordance stacked under the requirement group).
        expect(html).toContain('data-work-readiness-owner-link="children"');
        expect(html).toContain('data-work-readiness-owner-link="household"');
        expect(html).not.toContain("Open Children →");
        expect(html).not.toContain("Open Household →");
    });

    it("dedupes duplicate fields within an owner group", () => {
        const html = renderToStaticMarkup(
            <ReadinessSummary
                surface={surfaceWith([
                    {
                        key: "child:dob-a",
                        label: "Date of birth",
                        status: "missing",
                        owner: { key: "children", label: "Children", card: "children", focus: null },
                    },
                    {
                        key: "child:dob-b",
                        label: "Date of birth",
                        status: "missing",
                        owner: { key: "children", label: "Children", card: "children", focus: null },
                    },
                ])}
                onNavigate={() => {}}
            />,
        );
        expect(html.match(/Date of birth/g)?.length).toBe(1);
    });

    it("labels an unknown owner group but renders no handoff link", () => {
        const html = renderToStaticMarkup(
            <ReadinessSummary
                surface={surfaceWith([
                    {
                        key: "billing:autopay",
                        label: "Autopay consent",
                        status: "missing",
                        owner: { key: "billing_account", label: "Billing Account", card: null, focus: null },
                    },
                ])}
                onNavigate={() => {}}
            />,
        );
        expect(html).toContain('data-work-readiness-owner="billing_account"');
        expect(html).toContain("Billing Account");
        expect(html).toContain("Autopay consent");
        expect(html).not.toContain("Open Billing Account →");
    });
});

describe("buildCurrentWorkSurfaceVM ownership (process-agnostic)", () => {
    function readiness(gaps: ReadinessResult["gaps"]): ReadinessResult {
        return {
            contract_version: "1.0",
            primary_state: "needs_information",
            trigger: "record_view",
            subject: { entity_type: "opportunity", entity_id: "opp-1" },
            context: { org_id: "org-1" },
            gaps,
            counts: {
                gaps_total: gaps.length,
                by_level: { recommended: 0, required: gaps.length, enforced: 0 },
                blocking: 0,
                satisfied: 0,
                configured: gaps.length,
            },
            ok: false,
        };
    }

    function context(): OperationalContext {
        return {
            grain: "case",
            subject: { type: "opportunity", id: "opp-1", label: "Acme Service Co" },
            // Deliberately NOT enrollment — the runtime must not care.
            businessProcess: { key: "service_intake", label: "Service Intake", stageKey: "triage" },
            perspective: null,
            truth: { id: "opp-1" },
            stageWorkRuntime: null,
            signals: {
                work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
                attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
                tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
                communications: {
                    scheduledSendCount: 0,
                    nextFollowUpAt: null,
                    hasOutreach: false,
                    nextScheduledSendId: null,
                },
                billing: {
                    billingConfigured: false,
                    billingContactName: null,
                    billingContactEmail: null,
                    tuitionRateLabel: null,
                    feeBalanceCents: null,
                },
            },
            capabilities: { canMutate: true, maskedChannels: false },
            status: "ready",
        };
    }

    it("carries owner metadata and suppresses internal identifiers in the readiness VM", () => {
        const vm = buildCurrentWorkSurfaceVM({
            context: context(),
            readinessProjection: readiness([
                {
                    requirement_id: "child:program",
                    scope_type: "record",
                    level: "required",
                    label: "Program selection",
                    missing_reason: "No program chosen",
                    failure_kind: "missing",
                    blocking: false,
                    entity_type: "child",
                },
                {
                    requirement_id: "opportunity:location_id",
                    scope_type: "record",
                    level: "required",
                    label: "Location Id",
                    missing_reason: "Foreign key not linked",
                    failure_kind: "missing",
                    blocking: false,
                    entity_type: "opportunity",
                },
            ]),
        });
        const items = vm.readiness.requirements?.items ?? [];
        // The internal identifier is suppressed; only the real requirement remains.
        expect(items.map((i) => i.label)).toEqual(["Program selection"]);
        expect(items[0]?.owner?.card).toBe("children");
        expect(items.some((i) => /Location Id/i.test(i.label))).toBe(false);
    });
});
