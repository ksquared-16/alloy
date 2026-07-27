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

    it("lists Create Lead from the registered action registry", () => {
        expect(BOS_SLASH_SESSION_ADAPTER_KEYS).toContain("create_lead");
        const items = queryBosSlashCatalog({ query: "/" });
        expect(items.some((i) => i.actionKey === "create_lead" && i.eligible)).toBe(true);
        expect(items.every((i) => BOS_SLASH_SESSION_ADAPTER_KEYS.includes(i.actionKey as "create_lead"))).toBe(
            true
        );
    });

    it("typeahead filters Create Lead", () => {
        const items = queryBosSlashCatalog({ query: "/cre" });
        expect(items).toHaveLength(1);
        expect(items[0]?.actionKey).toBe("create_lead");
        expect(items[0]?.displayLabel).toBe("Create Lead");
        expect(items[0]?.token).toBe("create-lead");
    });

    it("respects placedActionKeys when provided", () => {
        const blocked = queryBosSlashCatalog({
            query: "/",
            placedActionKeys: ["confirm_tour"],
        });
        expect(blocked.find((i) => i.actionKey === "create_lead")?.eligible).toBe(false);

        const allowed = queryBosSlashCatalog({
            query: "/",
            placedActionKeys: ["create_lead"],
        });
        expect(allowed.find((i) => i.actionKey === "create_lead")?.eligible).toBe(true);
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
    });
});
