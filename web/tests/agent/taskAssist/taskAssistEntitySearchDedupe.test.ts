import { describe, expect, it } from "vitest";

import {
    dedupeTaskAssistEntitySearchCandidates,
    mergeTaskAssistEntitySearchCandidates,
} from "@/lib/agent/taskAssist/taskAssistEntitySearchDedupe";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

const base = (overrides: Partial<TaskAssistEntitySearchCandidate>): TaskAssistEntitySearchCandidate => ({
    entity_type: "opportunities",
    entity_id: "opp-1",
    label: "Family inquiry — Mitchell / South Campus",
    subtitle: null,
    confidence: "medium",
    source: "customer_family",
    matched_fields: ["customer.name"],
    ...overrides,
});

describe("taskAssistEntitySearchDedupe", () => {
    it("merges same opportunity from customer and person bridges", () => {
        const customer = base({
            source: "customer_family",
            matched_fields: ["customer.name"],
            disambiguation: { customer_name: "Mitchell household", location_name: "South Campus" },
        });
        const person = base({
            source: "primary_person",
            confidence: "high",
            matched_fields: ["primary_person_id"],
            subtitle: "Matched contact: Sarah Mitchell",
        });
        const merged = mergeTaskAssistEntitySearchCandidates(customer, person);
        expect(merged.source).toBe("customer_family");
        expect(merged.confidence).toBe("high");
        expect(merged.matched_fields).toEqual(expect.arrayContaining(["customer.name", "primary_person_id"]));
        expect(merged.disambiguation?.location_name).toBe("South Campus");
    });

    it("dedupes list to one row per entity_id", () => {
        const list = dedupeTaskAssistEntitySearchCandidates([
            base({ source: "opportunity_name" }),
            base({ source: "primary_person", matched_fields: ["persons.last_name"] }),
        ]);
        expect(list).toHaveLength(1);
        expect(list[0]?.entity_id).toBe("opp-1");
    });
});
