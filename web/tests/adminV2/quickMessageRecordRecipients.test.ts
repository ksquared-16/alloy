import { describe, expect, it } from "vitest";

import type { DrawerEmailRecipientRow } from "@/lib/communications/drawerEmailRecipients";
import {
    mergeQuickMessageRecipients,
    resolveQuickMessageSelection,
} from "@/lib/adminV2/quickMessageRecordRecipients";

describe("quickMessageRecordRecipients", () => {
    it("mergeQuickMessageRecipients adds queue-row person when API returns empty", () => {
        const merged = mergeQuickMessageRecipients([], {
            personId: "person-kelly",
            displayName: "Kelly Kurzman",
            email: "kelly@example.com",
            phone: "+15551234567",
        });
        expect(merged).toHaveLength(1);
        expect(merged[0]?.person_id).toBe("person-kelly");
        expect(merged[0]?.display_name).toBe("Kelly Kurzman");
    });

    it("resolveQuickMessageSelection prefers queue row person", () => {
        const rows: DrawerEmailRecipientRow[] = [
            {
                person_id: "p-a",
                display_name: "A",
                email: "a@example.com",
                phone: null,
                relationship_hint: "parent",
                is_suggested_default: true,
            },
            {
                person_id: "p-b",
                display_name: "B",
                email: "b@example.com",
                phone: null,
                relationship_hint: null,
                is_suggested_default: false,
            },
        ];
        const selected = resolveQuickMessageSelection({ rows, preferredPersonId: "p-b" });
        expect(selected[0]?.person_id).toBe("p-b");
    });
});
