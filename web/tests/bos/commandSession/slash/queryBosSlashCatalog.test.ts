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

    it("lists Create Lead from the registered action registry when process-selected", () => {
        expect(BOS_SLASH_SESSION_ADAPTER_KEYS).toContain("create_lead");
        const items = queryBosSlashCatalog({
            query: "/",
            processEffectiveCommandKeys: new Set(["create_lead"]),
        });
        expect(items.some((i) => i.actionKey === "create_lead" && i.eligible)).toBe(true);
        expect(
            items.every((i) => BOS_SLASH_SESSION_ADAPTER_KEYS.includes(i.actionKey as "create_lead"))
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

    it("does not invent a hardcoded catalog detached from the registry", () => {
        const src = require("node:fs").readFileSync(
            require("node:path").resolve(
                __dirname,
                "../../../../lib/bos/commandSession/slash/queryBosSlashCatalog.ts"
            ),
            "utf8"
        );
        expect(src).toContain("listRegisteredActionKeys");
        expect(src).toContain("getRegisteredAction");
        expect(src).toContain("bosProposalSupport");
        expect(src).toContain("processEffectiveCommandKeys");
    });
});
