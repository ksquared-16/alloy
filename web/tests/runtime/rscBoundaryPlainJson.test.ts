import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { UNKNOWN_FIELDS, withUnknownFields } from "@/lib/config/preserveUnknownFields";
import { toRscPlainJson } from "@/lib/runtime/toRscPlainJson";

const webRoot = resolve(__dirname, "../..");

describe("toRscPlainJson", () => {
    it("strips alloy.config.unknownFields symbols so Flight can serialize Work Views", () => {
        const view = withUnknownFields(
            {
                id: "all",
                label: "All",
                display_order: 1,
                visible_in_runtime: true,
                filters_v1: [],
            },
            { future_key: true },
        );
        expect(Object.getOwnPropertySymbols(view).some((s) => s === UNKNOWN_FIELDS)).toBe(true);

        const plain = toRscPlainJson({
            lensSet: [view, withUnknownFields({ id: "new", label: "New" }, { x: 1 })],
        });
        expect(Object.getOwnPropertySymbols(plain.lensSet[0]!)).toHaveLength(0);
        expect(Object.getOwnPropertySymbols(plain.lensSet[1]!)).toHaveLength(0);
        expect(JSON.stringify(plain)).not.toContain("unknownFields");
        expect(plain.lensSet[0]).toMatchObject({ id: "all", label: "All" });
    });
});

describe("ProvisioningAnswerSeed RSC scrub", () => {
    it("work-unit page scrubs the answer before Client Component props", () => {
        const page = readFileSync(
            resolve(webRoot, "app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx"),
            "utf8",
        );
        expect(page).toContain("toRscPlainJson");
        expect(page).toMatch(/answer=\{answer \? toRscPlainJson\(answer\) : null\}/);
    });
});

describe("BOS presentation hydration", () => {
    it("does not read sessionStorage in useState initializers", () => {
        const src = readFileSync(
            resolve(webRoot, "contexts/BosPresentationControllerContext.tsx"),
            "utf8",
        );
        expect(src).toContain('const SSR_PREFERRED: BosPresentationState = "floating"');
        expect(src).toContain("setSessionHydrated(true)");
        // Must not call session readers inside useState(() => …) for preferred.
        expect(src).not.toMatch(/useState<BosPresentationState>\(\(\) => initialPreferred/);
        expect(src).not.toMatch(/useState<BosPresentationState>\(\(\) => readBosPresentationPreference/);
        expect(src).toMatch(/useState<BosPresentationState>\(SSR_PREFERRED\)/);
    });
});
