import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
    buildLifecycleStageQueueDefinitionForPresentation,
    buildLifecycleWaitlistStageQueueDefinition,
    lifecycleStageQueueRowPreviewFields,
} from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import { buildScheduleTourPickerRowFromEntitySearch } from "@/lib/admin/actions/scheduleTourRecordPickerSearch";
import { formatOpportunityOperatorDisplayLabel } from "@/lib/admin/opportunityDisplayLabel";
import {
    ADMINV2_OPEN_TOUR_SCHEDULE_MODAL,
    openTourScheduleModalForOpportunity,
} from "@/lib/tours/actions/tourBookingActionClient";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

const WEB_ROOT = join(process.cwd());

describe("lifecycleRuntimeUxPolish", () => {
    it("standard lifecycle rows include desired_start_date and tour_date when present in field list", () => {
        const fields = lifecycleStageQueueRowPreviewFields("lead");
        expect(fields).toContain("desired_start_date");
        expect(fields).toContain("tour_date");
    });

    it("tour stage rows show tour_date before desired_start_date", () => {
        const fields = lifecycleStageQueueRowPreviewFields("tour");
        const tourIdx = fields.indexOf("tour_date");
        const startIdx = fields.indexOf("desired_start_date");
        expect(tourIdx).toBeGreaterThanOrEqual(0);
        expect(startIdx).toBeGreaterThan(tourIdx);
    });

    it("waitlist rows include phone and email but not tour_date", () => {
        const fields = lifecycleStageQueueRowPreviewFields("waitlist");
        expect(fields).toContain("phone");
        expect(fields).toContain("email");
        expect(fields).not.toContain("tour_date");

        const doc = buildLifecycleWaitlistStageQueueDefinition({
            stageKey: "waitlist",
            label: "Waitlist",
            statusKeys: ["waitlisted"],
        });
        const preview = (doc.ui as { row_preview?: { fields?: string[] } }).row_preview;
        expect(preview?.fields).toEqual(fields);
    });

    it("lead stage queue definition row_preview matches stage field rules", () => {
        const doc = buildLifecycleStageQueueDefinitionForPresentation({
            stageKey: "lead",
            label: "Lead",
            statusKeys: ["new_inquiry"],
        });
        const preview = (doc.ui as { row_preview?: { fields?: string[] } }).row_preview;
        expect(preview?.fields).toEqual(lifecycleStageQueueRowPreviewFields("lead"));
    });

    it("schedule tour picker strips Family inquiry boilerplate from row labels", () => {
        const candidate: TaskAssistEntitySearchCandidate = {
            entity_type: "opportunities",
            entity_id: "opp-chen",
            label: "Family inquiry — Chen / West Campus",
            subtitle: "Customer: Chen Household",
            source: "opportunity_name",
            matched_fields: ["name"],
            confidence: "medium",
            disambiguation: { location_name: "West Campus", customer_name: "Chen" },
        };
        const row = buildScheduleTourPickerRowFromEntitySearch(candidate, { opportunityEntityLabel: "Lead" });
        expect(row?.primaryLabel).toBe("Chen / West Campus");
        expect(row?.primaryLabel.toLowerCase()).not.toContain("family inquiry");
    });

    it("formatOpportunityOperatorDisplayLabel never returns Family inquiry verbatim", () => {
        expect(formatOpportunityOperatorDisplayLabel("Family inquiry — Chen / West Campus")).toBe(
            "Chen / West Campus"
        );
        expect(formatOpportunityOperatorDisplayLabel("Family inquiry", { entitySingularLabel: "Lead" })).toBe(
            "Lead"
        );
    });

    it("schedule tour picker modal uses Search records... placeholder and no scope copy", () => {
        const src = readFileSync(
            join(WEB_ROOT, "components/admin/workspace/WorkUnitScheduleTourRecordPickerModal.tsx"),
            "utf8"
        );
        expect(src).toContain('placeholder="Search records..."');
        expect(src).not.toMatch(/Search any opportunity you can access/i);
        expect(src).not.toContain("Family inquiry");
    });

    it("openTourScheduleModalForOpportunity opens drawer and dispatches schedule tour modal event", () => {
        const openDrawer = vi.fn();
        const dispatch = vi.fn();
        vi.stubGlobal("window", {
            dispatchEvent: dispatch,
        } as unknown as Window & typeof globalThis);

        openTourScheduleModalForOpportunity("opp-99", openDrawer);

        expect(openDrawer).toHaveBeenCalledWith({ type: "opportunities", id: "opp-99" });
        expect(dispatch).toHaveBeenCalledTimes(1);
        const ev = dispatch.mock.calls[0]?.[0] as CustomEvent<{ opportunity_id?: string }>;
        expect(ev.type).toBe(ADMINV2_OPEN_TOUR_SCHEDULE_MODAL);
        expect(ev.detail?.opportunity_id).toBe("opp-99");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("user-facing lifecycle runtime modules do not contain Family inquiry in non-comment code", () => {
        const paths = [
            "lib/lifecycle/lifecycleStageQueuePresentation.ts",
            "lib/admin/actions/scheduleTourRecordPickerSearch.ts",
            "lib/admin/opportunityDisplayLabel.ts",
            "lib/agent/taskAssist/taskAssistEntitySearchService.ts",
            "lib/agent/taskAssist/taskAssistEntitySearchDisambiguation.ts",
            "components/admin/workspace/WorkUnitScheduleTourRecordPickerModal.tsx",
            "lib/tours/actions/tourBookingActionClient.ts",
        ];
        for (const rel of paths) {
            const text = readFileSync(join(WEB_ROOT, rel), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/\/\/.*$/gm, "");
            expect(text, rel).not.toMatch(/Family inquiry/);
        }
    });
});
