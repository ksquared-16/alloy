import { describe, expect, it } from "vitest";
import {
    COMPACT_ROW_EFFECTIVE_FIELD_KEYS,
    compactSlotForFieldKey,
    isCompactRowEffectiveFieldKey,
    mapQueueRowSurfaceToCompactConfig,
} from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import {
    collectRefKeysFromQueueRecordLayoutV3,
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
} from "@/lib/layout/queueRecordLayoutV3";

/**
 * Phase 2 — one field vocabulary. Builder field keys, published config keys, the runtime mapper and
 * the compact CondensedQueueRow slots must agree. A key is either runtime-effective (maps to a slot)
 * or explicitly flagged — never a silent no-op.
 */
describe("Queue Row field vocabulary", () => {
    it("compactSlotForFieldKey maps effective keys to slots and everything else to null", () => {
        expect(compactSlotForFieldKey("customer.display_name")).toBe("subject");
        expect(compactSlotForFieldKey("queue_row.subject_label")).toBe("subject");
        expect(compactSlotForFieldKey("opportunity.status_label")).toBe("status");
        expect(compactSlotForFieldKey("queue_row.stage_label")).toBe("status");
        expect(compactSlotForFieldKey("person.primary_contact_name")).toBe("contact");
        expect(compactSlotForFieldKey("person.phone")).toBe("contact");
        expect(compactSlotForFieldKey("person.email")).toBe("contact");
        expect(compactSlotForFieldKey("opportunity.attention_reason")).toBe("attention");
        expect(compactSlotForFieldKey("queue_row.work_summary")).toBe("work");
        expect(compactSlotForFieldKey("queue_row.next_best_action_label")).toBe("work");
        expect(compactSlotForFieldKey("queue_row.group_count_label")).toBe("groupCount");
        expect(compactSlotForFieldKey("child.name")).toBe("groupCount");
        expect(compactSlotForFieldKey("children")).toBe("groupCount");
        expect(compactSlotForFieldKey("children.count")).toBe("groupCount");
        expect(compactSlotForFieldKey("children.names")).toBe("groupCount");
        expect(compactSlotForFieldKey("children.summary")).toBe("groupCount");
        expect(compactSlotForFieldKey("opportunity.tour_date")).toBeNull();
        expect(compactSlotForFieldKey("waitlist.positionLabel")).toBe("groupCount");
        expect(compactSlotForFieldKey("waitlist.waitSince")).toBe("groupCount");
        expect(compactSlotForFieldKey("child.program")).toBe("groupCount");
        expect(compactSlotForFieldKey("opportunity.next_step")).toBe("work");
        expect(compactSlotForFieldKey("child.room")).toBe("groupCount");
        expect(compactSlotForFieldKey("")).toBeNull();
    });

    it("every effective key classifies to a slot, and the canonical keys are present", () => {
        expect(COMPACT_ROW_EFFECTIVE_FIELD_KEYS.size).toBeGreaterThan(0);
        for (const key of COMPACT_ROW_EFFECTIVE_FIELD_KEYS) {
            expect(compactSlotForFieldKey(key)).not.toBeNull();
        }
        for (const key of [
            "customer.display_name",
            "opportunity.status_label",
            "person.primary_contact_name",
            "queue_row.work_summary",
        ]) {
            expect(COMPACT_ROW_EFFECTIVE_FIELD_KEYS.has(key)).toBe(true);
        }
    });

    it("EVERY field key in the default layouts is deterministically classified — no silent no-op", () => {
        for (const layout of [defaultLeadQueueLayoutV3(), defaultWaitlistQueueLayoutV3()]) {
            for (const key of collectRefKeysFromQueueRecordLayoutV3(layout)) {
                // The two classifiers agree exactly — effective iff it maps to a slot.
                expect(isCompactRowEffectiveFieldKey(key)).toBe(compactSlotForFieldKey(key) != null);
            }
        }
    });

    it("published default config maps deterministically (idempotent), effective slots not fallbacks", () => {
        const cfg = defaultLeadQueueLayoutV3();
        const a = mapQueueRowSurfaceToCompactConfig(cfg);
        const b = mapQueueRowSurfaceToCompactConfig(cfg);
        expect(a).toEqual(b);
        // The lead layout publishes subject + status + contact + attention + work fields → those
        // slots are driven by config, NOT generic-context fallbacks.
        expect(a.fallbackSlots).not.toContain("subject");
        expect(a.fallbackSlots).not.toContain("status");
        expect(a.fallbackSlots).not.toContain("contact");
    });

    it("default lead layout maps phone and email into contact slot fieldKeys", () => {
        const mapped = mapQueueRowSurfaceToCompactConfig(defaultLeadQueueLayoutV3());
        expect(mapped.slots.contact.fieldKeys).toEqual([
            "person.primary_contact_name",
            "person.phone",
            "person.email",
        ]);
    });
});
