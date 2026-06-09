import { describe, expect, it } from "vitest";
import {
    buildLeadLayoutPickerGroups,
    catalogGroupsForEntityType,
    CURATED_FIELDS,
    LAYOUT_ENTITY_GROUPS,
} from "@/lib/layout/fieldCatalog";
import {
    entityKeysForQueueRecordScope,
    filterCatalogGroupsForScope,
    isWaitlistShapedCatalog,
    waitlistRefKeyMatchesQueueRecordScope,
} from "@/lib/layout/queueRecordScopeCatalog";
import type { QueueRecordScope } from "@/lib/layout/queueRecordLayoutV3";

const childrenScope: QueueRecordScope = { type: "repeated_related", relationshipKey: "children" };
const mainScope: QueueRecordScope = { type: "main_record" };
const lifecycleScope: QueueRecordScope = { type: "lifecycle_context" };

function leadPickerFromCuratedFallback() {
    const raw = LAYOUT_ENTITY_GROUPS.map((g) => ({
        entityKey: g.entityKey,
        entityLabel: g.entityLabel,
        fields: CURATED_FIELDS[g.entityKey] ?? [],
    }));
    return buildLeadLayoutPickerGroups(raw, "opportunities");
}

function scopedFieldRefKeys(groups: ReturnType<typeof filterCatalogGroupsForScope>): string[] {
    return groups.flatMap((g) => g.fields.map((f) => f.refKey)).sort();
}

describe("queueRecordScopeCatalog", () => {
    it("detects placement_candidate waitlist-shaped catalogs", () => {
        const waitlist = catalogGroupsForEntityType("placement_candidate") ?? [];
        expect(isWaitlistShapedCatalog(waitlist)).toBe(true);
        expect(isWaitlistShapedCatalog(leadPickerFromCuratedFallback())).toBe(false);
    });

    it("Lead children scope returns child and inquiry_child fields", () => {
        const lead = leadPickerFromCuratedFallback();
        const scoped = filterCatalogGroupsForScope(lead, childrenScope);
        const refKeys = scopedFieldRefKeys(scoped);

        expect(refKeys.length).toBeGreaterThan(0);
        expect(refKeys.some((k) => k.startsWith("child."))).toBe(true);
        expect(refKeys.some((k) => k.startsWith("inquiry_child."))).toBe(true);
        expect(refKeys.some((k) => k.startsWith("opportunity."))).toBe(false);
    });

    it("Waitlist placement_candidate children scope is no longer empty (refKey fallback)", () => {
        const waitlist = catalogGroupsForEntityType("placement_candidate") ?? [];
        const scoped = filterCatalogGroupsForScope(waitlist, childrenScope);
        const refKeys = scopedFieldRefKeys(scoped);

        expect(refKeys.length).toBeGreaterThan(0);
        expect(refKeys).toContain("child.name");
        expect(refKeys).not.toContain("household.phone");
    });

    it("Lead allowed scopes are unchanged for main and lifecycle", () => {
        const lead = leadPickerFromCuratedFallback();
        const mainKeys = scopedFieldRefKeys(filterCatalogGroupsForScope(lead, mainScope));
        const lifecycleKeys = scopedFieldRefKeys(filterCatalogGroupsForScope(lead, lifecycleScope));

        expect(mainKeys).toEqual(expect.arrayContaining(["customer.name", "opportunity.status_key"]));
        expect(mainKeys.some((k) => k.startsWith("child."))).toBe(false);
        expect(lifecycleKeys).toContain("opportunity.status_key");
        expect(lifecycleKeys.some((k) => k.startsWith("child."))).toBe(false);
    });

    it("does not broaden Lead scope via waitlist refKey rules", () => {
        const lead = leadPickerFromCuratedFallback();
        expect(
            waitlistRefKeyMatchesQueueRecordScope(mainScope, "household.phone"),
        ).toBe(true);
        const mainKeys = scopedFieldRefKeys(filterCatalogGroupsForScope(lead, mainScope));
        expect(mainKeys).not.toContain("household.phone");
    });

    it("entityKeysForQueueRecordScope matches Lead picker buckets", () => {
        expect(entityKeysForQueueRecordScope(childrenScope)).toEqual(["child", "inquiry_child"]);
        expect(entityKeysForQueueRecordScope(mainScope)).toEqual(["opportunity", "customer"]);
    });
});
