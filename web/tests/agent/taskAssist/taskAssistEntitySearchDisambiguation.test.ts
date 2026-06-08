import { describe, expect, it } from "vitest";

import {
    applyLabelDisambiguationForDuplicates,
    childDisplayNameFromOppMetadata,
    formatCandidateOperatorPresentation,
} from "@/lib/agent/taskAssist/taskAssistEntitySearchDisambiguation";
import { dedupeTaskAssistEntitySearchCandidates } from "@/lib/agent/taskAssist/taskAssistEntitySearchDedupe";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

const base = (overrides: Partial<TaskAssistEntitySearchCandidate>): TaskAssistEntitySearchCandidate => ({
    entity_type: "opportunities",
    entity_id: "opp-1",
    label: "Family inquiry — Mitchell / South Campus",
    subtitle: null,
    confidence: "medium",
    source: "customer_member",
    matched_fields: ["customer_members.name"],
    ...overrides,
});

describe("taskAssistEntitySearchDisambiguation", () => {
    it("extracts child name from inquiry metadata", () => {
        expect(
            childDisplayNameFromOppMetadata({
                inquiry_children: [{ display_name: "Mia Mitchell" }],
            })
        ).toBe("Mia Mitchell");
    });

    it("merges same entity_id from two member bridges into one candidate", () => {
        const mia = base({
            entity_id: "opp-shared",
            disambiguation: { matched_members: ["Mia Mitchell"], customer_id: "cust-1" },
            subtitle: "Matched member: Mia Mitchell",
        });
        const ethan = base({
            entity_id: "opp-shared",
            source: "primary_person",
            matched_fields: ["primary_person_id"],
            disambiguation: { matched_members: ["Ethan Mitchell"], matched_contacts: ["Sarah Mitchell"] },
            subtitle: "Matched member: Ethan Mitchell · Matched contact: Sarah Mitchell",
        });
        const merged = dedupeTaskAssistEntitySearchCandidates([mia, ethan]);
        expect(merged).toHaveLength(1);
        expect(merged[0]?.disambiguation?.matched_members).toEqual(
            expect.arrayContaining(["Mia Mitchell", "Ethan Mitchell"])
        );
        expect(merged[0]?.disambiguation?.matched_contacts).toEqual(["Sarah Mitchell"]);
    });

    it("keeps distinct entity ids separate but disambiguates identical labels", () => {
        const list = applyLabelDisambiguationForDuplicates([
            base({
                entity_id: "opp-mia",
                disambiguation: {
                    child_display_name: "Mia Mitchell",
                    opportunity_number: 101,
                    status_key: "new_inquiry",
                },
            }),
            base({
                entity_id: "opp-ethan",
                disambiguation: {
                    child_display_name: "Ethan Mitchell",
                    opportunity_number: 102,
                    status_key: "new_inquiry",
                },
            }),
        ]);
        expect(list).toHaveLength(2);
        expect(list[0]?.label).toContain("Mia Mitchell");
        expect(list[1]?.label).toContain("Ethan Mitchell");
        expect(list[0]?.entity_id).not.toBe(list[1]?.entity_id);
    });

    it("formatCandidateOperatorPresentation surfaces match reason without raw ids", () => {
        const p = formatCandidateOperatorPresentation(
            base({
                matched_fields: ["ambient_context"],
                disambiguation: { status_key: "new_inquiry", location_name: "West Campus" },
            })
        );
        expect(p.matchReasonLine).toBe("Matched active drawer context");
        expect(p.secondaryLine).toContain("West Campus");
        expect(JSON.stringify(p)).not.toContain("opp-1");
    });
});
