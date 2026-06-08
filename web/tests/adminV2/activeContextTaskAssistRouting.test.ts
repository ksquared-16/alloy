import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    activeOpportunityFromContext,
    buildActiveOpportunitySearchCandidate,
    commandExplicitlyRequestsRecordSearch,
    shouldShortCircuitTaskAssistEntitySearch,
    usingActiveRecordNoticeText,
} from "@/lib/adminV2/bos/activeOperationalContext";
import { formatCandidateOperatorPresentation } from "@/lib/agent/taskAssist/taskAssistEntitySearchDisambiguation";

const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const threadPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
);

describe("active drawer context Task Assist routing", () => {
    it("short-circuits entity search when active opportunity exists", () => {
        expect(
            shouldShortCircuitTaskAssistEntitySearch({
                command: "Follow up with Chen household — Respond to new request",
                activeOpportunity: { entity_id: "opp-chen" },
            })
        ).toBe(true);
    });

    it("does not short-circuit when operator explicitly searches records", () => {
        expect(
            shouldShortCircuitTaskAssistEntitySearch({
                command: "find all opportunities for Chen",
                activeOpportunity: { entity_id: "opp-chen" },
            })
        ).toBe(false);
        expect(commandExplicitlyRequestsRecordSearch("which record is this for")).toBe(true);
    });

    it("does not short-circuit without active opportunity", () => {
        expect(
            shouldShortCircuitTaskAssistEntitySearch({
                command: "text Chen family",
                activeOpportunity: null,
            })
        ).toBe(false);
    });

    it("buildActiveOpportunitySearchCandidate tags ambient_context", () => {
        const chip = buildActiveOpportunitySearchCandidate({
            entity_id: "opp-1",
            label: "Chen household",
        });
        expect(chip.entity_id).toBe("opp-1");
        expect(chip.matched_fields).toContain("ambient_context");
    });

    it("usingActiveRecordNoticeText is operator-facing", () => {
        expect(usingActiveRecordNoticeText("Chen household")).toBe("Using active record: Chen household");
    });

    it("activeOpportunityFromContext reads GlobalAssistant opportunity", () => {
        const ctx = activeOpportunityFromContext({
            entity_type: "opportunities",
            entity_id: "opp-9",
            label: "Chen household",
            source_surface: "opportunity_drawer",
        });
        expect(ctx?.entity_id).toBe("opp-9");
    });
});

describe("AICommandSurfaceShell active context wiring", () => {
    it("uses short-circuit before fetchTaskAssistEntitySearch", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).toContain("shouldShortCircuitTaskAssistEntitySearch");
        expect(src).toContain("usingActiveRecordNoticeText");
        expect(src).toContain("proceedToTaskAssistAction(chip, effectiveIntent)");
        const shortIdx = src.indexOf("shouldShortCircuitTaskAssistEntitySearch");
        const fetchIdx = src.indexOf("fetchTaskAssistEntitySearch({");
        expect(shortIdx).toBeGreaterThan(-1);
        expect(fetchIdx).toBeGreaterThan(shortIdx);
    });
});

describe("CommandSurfaceThread candidate readability", () => {
    it("uses operator presentation and hides debug ids by default", () => {
        const src = readFileSync(threadPath, "utf8");
        expect(src).toContain("formatCandidateOperatorPresentation");
        expect(src).toContain("data-command-surface-candidate-match-reason");
        expect(src).not.toMatch(
            /showSearchDebug\s*=\s*process\.env\.NODE_ENV === "development" \|\| process\.env\.NODE_ENV === "test"/
        );
    });

    it("operator presentation omits raw entity id", () => {
        const lines = formatCandidateOperatorPresentation({
            entity_type: "opportunities",
            entity_id: "uuid-should-not-show",
            label: "Chen household",
            subtitle: "Matched member: Sarah",
            confidence: "high",
            source: "customer_member",
            matched_fields: ["customer_members.name"],
            disambiguation: {
                status_key: "new_inquiry",
                location_name: "West Campus",
                matched_members: ["Sarah Chen", "Sophia Chen"],
            },
        });
        expect(lines.primaryLabel).toBe("Chen household");
        expect(lines.secondaryLine).toContain("West Campus");
        expect(lines.relatedPeopleLine).toContain("Sarah Chen");
        expect(JSON.stringify(lines)).not.toContain("uuid-should-not-show");
    });
});
