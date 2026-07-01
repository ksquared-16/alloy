/**
 * Person + Child drawer layout-runtime save adapter foundations.
 */

import { describe, expect, it } from "vitest";
import { buildChildLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildChildLayoutRuntimeRecordFromVm";
import { buildPersonLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm";
import {
    collectLayoutRuntimeChildStandaloneBaselines,
    saveLayoutRuntimeChildStandaloneEdits,
} from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import { resolveLayoutRuntimePersonId } from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";

describe("resolveLayoutRuntimePersonId", () => {
    it("resolves person.id on standalone person drawer records", () => {
        expect(
            resolveLayoutRuntimePersonId({
                id: "person-abc",
                "person.id": "person-abc",
            }),
        ).toBe("person-abc");
    });

    it("still resolves opportunity host primary person id", () => {
        expect(
            resolveLayoutRuntimePersonId({
                id: "opp-1",
                _primary_person_id: "person-host",
            }),
        ).toBe("person-host");
    });
});

describe("buildPersonLayoutRuntimeRecordFromVm", () => {
    it("sets person.id for layout-runtime contact save resolution", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm({
            personId: "person-abc",
            vmRecord: { first_name: "Jamie", last_name: "Johnson", email: "jamie@example.com" },
        });
        expect(record["person.id"]).toBe("person-abc");
        expect(resolveLayoutRuntimePersonId(record)).toBe("person-abc");
    });
});

describe("buildChildLayoutRuntimeRecordFromVm", () => {
    it("includes customer member + OCM ids for standalone child field save", () => {
        const record = buildChildLayoutRuntimeRecordFromVm({
            personId: "child-person-1",
            vmRecord: {
                first_name: "Riley",
                last_name: "Brooks",
                _enrollment_mirror: [
                    {
                        id: "ocm-1",
                        customer_member_id: "cm-1",
                        opportunity_id: "opp-1",
                        program_label: "Infants",
                    },
                ],
            },
        });
        expect(record.customer_member_id).toBe("cm-1");
        expect(record.ocm_id).toBe("ocm-1");
        expect(collectLayoutRuntimeChildStandaloneBaselines(record)["child.first_name"]).toBe("Riley");
    });
});

describe("saveLayoutRuntimeChildStandaloneEdits", () => {
    it("no-ops when draft matches baseline", async () => {
        const record = buildChildLayoutRuntimeRecordFromVm({
            personId: "child-person-1",
            vmRecord: {
                first_name: "Riley",
                _enrollment_mirror: [{ id: "ocm-1", customer_member_id: "cm-1", opportunity_id: "opp-1" }],
            },
        });
        const baseline = collectLayoutRuntimeChildStandaloneBaselines(record);
        const result = await saveLayoutRuntimeChildStandaloneEdits({
            record,
            baseline,
            draft: { ...baseline },
        });
        expect(result.ok).toBe(true);
    });
});
