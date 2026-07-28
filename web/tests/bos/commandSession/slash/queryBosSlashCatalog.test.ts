import { describe, expect, it } from "vitest";

import {
    BOS_SLASH_SESSION_ADAPTER_KEYS,
    isBosSlashComposerQuery,
    queryBosSlashCatalog,
} from "@/lib/bos/commandSession/slash";

describe("queryBosSlashCatalog", () => {
    it("returns empty when composer is not in slash mode", () => {
        expect(isBosSlashComposerQuery("create lead")).toBe(false);
        expect(queryBosSlashCatalog({ query: "create lead" })).toEqual([]);
    });

    it("lists adapter-ready Commands when process-selected", () => {
        expect(BOS_SLASH_SESSION_ADAPTER_KEYS).toEqual(
            expect.arrayContaining([
                "create_lead",
                "update_lead_status",
                "add_parent_guardian",
                "cancel_tour",
            ])
        );
        const items = queryBosSlashCatalog({
            query: "/",
            processEffectiveCommandKeys: new Set([
                "create_lead",
                "update_lead_status",
                "add_parent_guardian",
                "cancel_tour",
            ]),
        });
        expect(items.some((i) => i.actionKey === "create_lead" && i.eligible)).toBe(true);
        expect(items.some((i) => i.actionKey === "update_lead_status" && i.eligible)).toBe(true);
        expect(items.some((i) => i.actionKey === "add_parent_guardian" && i.eligible)).toBe(true);
        expect(items.some((i) => i.actionKey === "cancel_tour" && i.eligible)).toBe(true);
        expect(
            items.every((i) => BOS_SLASH_SESSION_ADAPTER_KEYS.includes(i.actionKey))
        ).toBe(true);
    });

    it("typeahead filters Create Lead", () => {
        const items = queryBosSlashCatalog({
            query: "/cre",
            processEffectiveCommandKeys: new Set(["create_lead"]),
        });
        expect(items).toHaveLength(1);
        expect(items[0]?.actionKey).toBe("create_lead");
        expect(items[0]?.displayLabel).toBe("Create Lead");
        expect(items[0]?.token).toBe("create-lead");
    });

    it("does not use Surface placement as BOS eligibility", () => {
        const items = queryBosSlashCatalog({
            query: "/",
            placedActionKeys: ["confirm_tour"],
            processEffectiveCommandKeys: new Set(["create_lead"]),
        });
        expect(items.find((i) => i.actionKey === "create_lead")?.eligible).toBe(true);
    });

    it("fails closed without process-effective keys", () => {
        const unknown = queryBosSlashCatalog({ query: "/" });
        expect(unknown.find((i) => i.actionKey === "create_lead")?.eligible).toBe(false);
        expect(unknown.find((i) => i.actionKey === "create_lead")?.ineligibleReason).toMatch(
            /Business Process/i
        );

        const empty = queryBosSlashCatalog({
            query: "/",
            processEffectiveCommandKeys: new Set(),
        });
        expect(empty.find((i) => i.actionKey === "create_lead")?.eligible).toBe(false);
        expect(empty.find((i) => i.actionKey === "create_lead")?.ineligibleReason).toMatch(
            /selected for this process/i
        );
    });

    it("marks unselected Commands ineligible even when adapter-ready", () => {
        const items = queryBosSlashCatalog({
            query: "/",
            processEffectiveCommandKeys: new Set(["create_lead"]),
        });
        expect(items.find((i) => i.actionKey === "cancel_tour")?.eligible).toBe(false);
        expect(items.find((i) => i.actionKey === "cancel_tour")?.ineligibleReason).toMatch(
            /selected for this process/i
        );
    });

    it("discovers from adapter registry + capability labels (not RegisteredAction alone)", () => {
        const src = require("node:fs").readFileSync(
            require("node:path").resolve(
                __dirname,
                "../../../../lib/bos/commandSession/slash/queryBosSlashCatalog.ts"
            ),
            "utf8"
        );
        expect(src).toContain("listBosCommandAdapterKeys");
        expect(src).toContain("getPlatformCapability");
        expect(src).toContain("processEffectiveCommandKeys");
        expect(src).not.toContain("listRegisteredActionKeys");
    });
});
