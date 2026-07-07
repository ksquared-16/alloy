/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    buildQueueRowLibraryCatalog,
    QUEUE_ROW_UNAVAILABLE_SIBLING_LIBRARY,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import {
    defaultWaitlistQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { normalizeQueueRecordLayoutConfig } from "@/lib/layout/runtime/normalizeQueueRecordLayoutConfig";
import {
    isValidatorAllowedQueueRecordFieldRefKey,
    validatorAllowedQueueRecordFieldRefKeys,
} from "@/lib/layout/queueRecordValidatorAllowList";
import {
    buildUnavailableSiblingLibraryEntries,
    isQueueRowSiblingFieldResolverBacked,
    QUEUE_ROW_RESOLVER_BACKED_SIBLING_FIELD_KEYS,
    QUEUE_ROW_SIBLING_COMPOSITE_FIELD_KEY,
    QUEUE_ROW_SIBLING_FIELD_KEYS,
    QUEUE_ROW_SIBLING_FIELD_METADATA,
} from "@/lib/layout/runtime/queueRowSiblingFieldRegistry";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";

const builderSrc = readFileSync(
    fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx", import.meta.url)),
    "utf8",
);
const librarySrc = readFileSync(
    fileURLToPath(new URL("../../lib/adminV2/settings/surfaces/queueRowBuilderLibrary.ts", import.meta.url)),
    "utf8",
);
const previewSrc = readFileSync(
    fileURLToPath(new URL("../../lib/adminV2/settings/surfaces/queueRowBuilderPreview.ts", import.meta.url)),
    "utf8",
);

function layoutWithExtraField(fieldKey: string): QueueRecordLayoutConfigV3 {
    const config = normalizeQueueRecordLayoutConfig(defaultWaitlistQueueLayoutV3());
    const column = config.columns[0]!;
    const block = column.blocks[0]!;
    if (block.type !== "field_group") return config;
    return {
        ...config,
        columns: [
            {
                ...column,
                blocks: [
                    {
                        ...block,
                        fields: [
                            ...block.fields,
                            {
                                id: "test-sibling-field",
                                fieldKey,
                                label: "Test sibling field",
                                showLabel: false,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe("queue row sibling publish guard", () => {
    it("marks resolver-backed sibling fields and rejects unregistered keys at publish", () => {
        expect(isQueueRowSiblingFieldResolverBacked(QUEUE_ROW_SIBLING_COMPOSITE_FIELD_KEY)).toBe(true);
        for (const key of QUEUE_ROW_SIBLING_FIELD_KEYS) {
            expect(isQueueRowSiblingFieldResolverBacked(key)).toBe(true);
        }
        expect(isQueueRowSiblingFieldResolverBacked("sibling.notRegistered")).toBe(false);

        const allowed = validatorAllowedQueueRecordFieldRefKeys(true);
        for (const key of QUEUE_ROW_RESOLVER_BACKED_SIBLING_FIELD_KEYS) {
            expect(allowed).toContain(key);
            expect(isValidatorAllowedQueueRecordFieldRefKey(key, true)).toBe(true);
        }

        const unregistered = validateQueueRecordLayoutConfig(layoutWithExtraField("sibling.notRegistered"), {
            isWaitlist: true,
        });
        expect(unregistered.ok).toBe(false);
        expect(unregistered.errors.some((e) => e.message.includes("sibling.notRegistered"))).toBe(true);
    });

    it("keeps unavailable sibling placeholders out of validator allow-list", () => {
        for (const item of QUEUE_ROW_UNAVAILABLE_SIBLING_LIBRARY) {
            expect(isQueueRowSiblingFieldResolverBacked(item.fieldKey)).toBe(false);
            expect(isValidatorAllowedQueueRecordFieldRefKey(item.fieldKey, true)).toBe(false);
            expect(isValidatorAllowedQueueRecordFieldRefKey(item.fieldKey, false)).toBe(false);
        }

        const unregisteredPublish = validateQueueRecordLayoutConfig(
            layoutWithExtraField("sibling.enrolledStatus"),
            { isWaitlist: true },
        );
        expect(unregisteredPublish.ok).toBe(false);
    });

    it("only exposes resolver-backed sibling vocabulary as active library fields", () => {
        const items = buildQueueRowLibraryCatalog({
            isWaitlist: true,
            includeWaitlistFields: true,
            inRowZoneKeys: ["children"],
        });
        const activeFieldKeys = items
            .filter((item): item is Extract<typeof item, { kind: "field" }> => item.kind === "field")
            .map((item) => item.fieldKey);

        for (const key of QUEUE_ROW_SIBLING_FIELD_KEYS) {
            expect(activeFieldKeys).toContain(key);
            expect(isQueueRowSiblingFieldResolverBacked(key)).toBe(true);
        }
        expect(activeFieldKeys).toContain(QUEUE_ROW_SIBLING_COMPOSITE_FIELD_KEY);

        const activeSiblingPrefixed = activeFieldKeys.filter((key) => key.startsWith("sibling."));
        for (const key of activeSiblingPrefixed) {
            expect(isQueueRowSiblingFieldResolverBacked(key)).toBe(true);
        }
    });

    it("uses operator label Sibling context for composite registry field only", () => {
        expect(QUEUE_ROW_SIBLING_FIELD_METADATA["sibling.names"].label).toBe("Sibling names");
        const items = buildQueueRowLibraryCatalog({
            isWaitlist: true,
            includeWaitlistFields: true,
            inRowZoneKeys: ["children"],
        });
        const composite = items.find(
            (item) => item.kind === "field" && item.fieldKey === QUEUE_ROW_SIBLING_COMPOSITE_FIELD_KEY,
        );
        expect(composite?.kind).toBe("field");
        if (composite?.kind === "field") {
            expect(composite.label).toBe("Sibling context");
        }
    });
});

describe("queue row builder sibling hardcoding guard", () => {
    it("does not hardcode sibling runtime values or derive sibling data in builder UI", () => {
        for (const src of [builderSrc, librarySrc, previewSrc]) {
            expect(src).not.toMatch(/Lennon|Wrigley/i);
            expect(src).not.toMatch(/Sibling also waitlisted:/i);
            expect(src).not.toContain("resolveQueueRowSiblingFields");
            expect(src).not.toContain("buildWaitlistSiblingContextLines");
        }

        expect(builderSrc).toContain('if (item.kind === "zone" || item.kind === "unavailable") return');
        expect(librarySrc).toContain("buildUnavailableSiblingLibraryEntries");
    });

    it("derives unavailable sibling placeholders from registry placeholder catalog", () => {
        expect(buildUnavailableSiblingLibraryEntries()).toEqual([...QUEUE_ROW_UNAVAILABLE_SIBLING_LIBRARY]);
    });
});
