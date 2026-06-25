import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    ALLOY_OS_COMPRESSED_GROUP_HEADER_HEIGHT_PX,
    ALLOY_OS_COMPRESSED_ROW_HEIGHT_PX,
    ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX,
    ALLOY_OS_RUNTIME_ENABLED,
    alloyOsRuntimeSplitActive,
    shouldClearFocusPanelOnPerspectiveChange,
} from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import {
    compressedQueueRowShowsChildCount,
    resolveCompressedQueueRowCue,
} from "@/lib/adminV2/runtime/compressedQueueRowCue";

const here = dirname(fileURLToPath(import.meta.url));
const RUNTIME_CSS = readFileSync(
    resolve(here, "../../../app/adminV2/components/alloyOsRuntime.css"),
    "utf8"
);

describe("Concept B — compressed row cue derivation", () => {
    it("resolves child count and shows the chip only when > 1", () => {
        expect(resolveCompressedQueueRowCue({ childrenCount: 0 }).childCount).toBe(0);
        expect(resolveCompressedQueueRowCue({ childrenCount: 1 }).childCount).toBe(1);
        expect(resolveCompressedQueueRowCue({ childrenCount: 3 }).childCount).toBe(3);
        expect(compressedQueueRowShowsChildCount(resolveCompressedQueueRowCue({ childrenCount: 1 }))).toBe(false);
        expect(compressedQueueRowShowsChildCount(resolveCompressedQueueRowCue({ childrenCount: 2 }))).toBe(true);
    });

    it("picks a single right cue by fixed priority: tour → rank → age → room → location", () => {
        expect(
            resolveCompressedQueueRowCue({
                tourContext: "Tour: 10:30am",
                waitlistPositionLabel: "#4",
                ageContext: "2y",
                locationContext: "Sunrise",
            }).rightCue
        ).toBe("Tour: 10:30am");
        expect(
            resolveCompressedQueueRowCue({ waitlistPositionLabel: "#4", ageContext: "2y", locationContext: "Sunrise" })
                .rightCue
        ).toBe("#4");
        expect(resolveCompressedQueueRowCue({ ageContext: "2y", locationContext: "Sunrise" }).rightCue).toBe("2y");
        expect(resolveCompressedQueueRowCue({ roomContext: "Toddler A", locationContext: "Sunrise" }).rightCue).toBe(
            "Toddler A"
        );
        expect(resolveCompressedQueueRowCue({ locationContext: "Sunrise" }).rightCue).toBe("Sunrise");
    });

    it("ignores empty/placeholder cue values", () => {
        expect(resolveCompressedQueueRowCue({ tourContext: "—", locationContext: "Sunrise" }).rightCue).toBe("Sunrise");
        expect(resolveCompressedQueueRowCue({ tourContext: "   ", ageContext: null }).rightCue).toBeNull();
        expect(resolveCompressedQueueRowCue({}).rightCue).toBeNull();
    });
});

describe("Concept B — perspective change closes the Focus Panel", () => {
    it("does not close on the initial perspective (no previous key)", () => {
        expect(
            shouldClearFocusPanelOnPerspectiveChange({
                previousPerspectiveKey: null,
                nextPerspectiveKey: "enrollment:todays_tours",
                drawerOpen: true,
            })
        ).toBe(false);
    });

    it("closes when the perspective key changes while the panel is open", () => {
        expect(
            shouldClearFocusPanelOnPerspectiveChange({
                previousPerspectiveKey: "enrollment:todays_tours",
                nextPerspectiveKey: "enrollment:waitlist",
                drawerOpen: true,
            })
        ).toBe(true);
    });

    it("never closes when the panel is not open", () => {
        expect(
            shouldClearFocusPanelOnPerspectiveChange({
                previousPerspectiveKey: "enrollment:todays_tours",
                nextPerspectiveKey: "enrollment:waitlist",
                drawerOpen: false,
            })
        ).toBe(false);
    });

    it("does not close when the perspective key is unchanged (record swap, not perspective change)", () => {
        expect(
            shouldClearFocusPanelOnPerspectiveChange({
                previousPerspectiveKey: "enrollment:todays_tours",
                nextPerspectiveKey: "enrollment:todays_tours",
                drawerOpen: true,
            })
        ).toBe(false);
    });
});

describe("Concept B — row switching preserves the split", () => {
    it("keeps split active across an in-place record swap (drawer stays open, same perspective)", () => {
        const base = { perspectiveActive: true, drawerOpen: true, onWorkUnitSurface: true };
        // open record
        expect(alloyOsRuntimeSplitActive(base)).toBe(true);
        // click a different row → panel stays open, perspective unchanged → split stays on
        expect(alloyOsRuntimeSplitActive({ ...base })).toBe(true);
        expect(
            shouldClearFocusPanelOnPerspectiveChange({
                previousPerspectiveKey: "enrollment:todays_tours",
                nextPerspectiveKey: "enrollment:todays_tours",
                drawerOpen: true,
            })
        ).toBe(false);
    });

    it("drops split only when the panel closes", () => {
        expect(
            alloyOsRuntimeSplitActive({ perspectiveActive: true, drawerOpen: false, onWorkUnitSurface: true })
        ).toBe(false);
    });
});

describe("Concept B — flag-off parity", () => {
    it("ships disabled by default (no NEXT_PUBLIC_ALLOY_OS_RUNTIME), so the cue never renders", () => {
        // QueueBlock guards cue derivation with `ALLOY_OS_RUNTIME_ENABLED ? … : null`.
        expect(ALLOY_OS_RUNTIME_ENABLED).toBe(false);
    });
});

describe("Concept B — compressed presentation CSS contract", () => {
    it("declares the 440px queue width + 80px row tokens", () => {
        expect(ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX).toBe(440);
        expect(ALLOY_OS_COMPRESSED_ROW_HEIGHT_PX).toBe(80);
        expect(ALLOY_OS_COMPRESSED_GROUP_HEADER_HEIGHT_PX).toBe(32);
        expect(RUNTIME_CSS).toContain("--alloy-os-queue-compressed-width: 440px");
        expect(RUNTIME_CSS).toContain("--alloy-os-compressed-row-height: 80px");
        expect(RUNTIME_CSS).toContain("--alloy-os-compressed-row-min-height: 76px");
        expect(RUNTIME_CSS).toContain("--alloy-os-compressed-row-max-height: 84px");
        expect(RUNTIME_CSS).toContain("--alloy-os-compressed-group-header-height: 32px");
    });

    it("fixes the compressed row height and clips overflow at card shell", () => {
        expect(RUNTIME_CSS).toMatch(/max-height:\s*var\(--alloy-os-compressed-row-max-height/);
        expect(RUNTIME_CSS).toContain("overflow: hidden");
    });

    it("places queue controls in the queue header, not the context bar", () => {
        expect(RUNTIME_CSS).toContain(".adminv2-os-queue-header");
        expect(RUNTIME_CSS).toContain(".adminv2-os-queue-header__title");
        expect(RUNTIME_CSS).toContain(".adminv2-os-queue-header__controls");
        expect(RUNTIME_CSS).toContain(".adminv2-os-queue-header__accent");
        expect(RUNTIME_CSS).not.toContain(".adminv2-os-context-controls");
    });

    it("reserves fixed avatar + right utility columns that do not overlap main content", () => {
        expect(RUNTIME_CSS).toMatch(/grid-template-columns:\s*3px 32px minmax\(0,\s*1fr\) minmax\(72px,\s*88px\)/);
        expect(RUNTIME_CSS).toContain(".adminv2-os-crow__right");
        expect(RUNTIME_CSS).not.toContain(".adminv2-os-crow__avatar-badge");
        expect(RUNTIME_CSS).not.toContain(".adminv2-os-crow__right-count");
    });

    it("gives the queue rail a clean 1px right border (no collision with Focus Panel edge)", () => {
        expect(RUNTIME_CSS).toMatch(
            /\.adminv2-ws-dept-v2-operational-row[\s\S]*border-right:\s*1px solid/
        );
    });

    it("pins queue rail width and reserves peer gap + focus panel dock vars", () => {
        expect(RUNTIME_CSS).toContain("--alloy-os-queue-peer-gap: 16px");
        expect(RUNTIME_CSS).toMatch(
            /\.adminv2-ws-dept-v2-operational-row[\s\S]*width:\s*var\(--alloy-os-queue-compressed-width/
        );
        expect(RUNTIME_CSS).toMatch(
            /\.adminv2-ws-dept-v2-operational-row[\s\S]*flex:\s*1 1 0/
        );
        expect(RUNTIME_CSS).toContain("--alloy-os-focus-panel-left");
    });

    it("aligns the Focus Panel right edge with the Work Unit Context right edge (+1px each side)", () => {
        // Panel right edge tracks the measured WUC right (--alloy-os-op-surface-right).
        expect(RUNTIME_CSS).toMatch(
            /right:\s*calc\(100vw\s*-\s*var\(--alloy-os-op-surface-right/
        );
        // +1px breathing pad on the panel left and the queue right.
        expect(RUNTIME_CSS).toMatch(
            /left:\s*calc\([\s\S]*--alloy-os-focus-panel-left[\s\S]*\+\s*1px/
        );
        expect(RUNTIME_CSS).toMatch(
            /\.adminv2-ws-dept-v2-operational-row[\s\S]*padding-right:\s*1px/
        );
    });

    it("styles queue toolbar + expanded filter controls at 32px with 8px radius and 2-col mini grid", () => {
        expect(RUNTIME_CSS).toMatch(
            /\.adminv2-os-queue-header \.adminv2-ws-wu-record-filter-bar__search[\s\S]*height:\s*32px/
        );
        expect(RUNTIME_CSS).toMatch(
            /\.adminv2-os-queue-header \.adminv2-ws-wu-record-filter-bar__advanced-fields[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
        );
        expect(RUNTIME_CSS).toMatch(
            /\.adminv2-os-queue-header \.adminv2-ws-wu-record-filter-bar__advanced-fields[\s\S]*gap:\s*8px/
        );
    });

    it("hides expanded-only bands in split mode (both row paths)", () => {
        expect(RUNTIME_CSS).toContain('[data-queue-row-band="lifecycle"]');
        expect(RUNTIME_CSS).toContain('[data-queue-row-band="people"]');
        expect(RUNTIME_CSS).toContain(".adminv2-ws-crm-queue-preview__operational-read");
        expect(RUNTIME_CSS).toContain('[data-queue-col-scope="repeated_related"]');
        expect(RUNTIME_CSS).toContain(".operational-queue-row__attention-widget");
    });

    it("makes the group header sticky and styles the selected row", () => {
        expect(RUNTIME_CSS).toMatch(/adminv2-ws-wu-queue-section-label\s*\{[\s\S]*?position:\s*sticky/);
        expect(RUNTIME_CSS).toContain('.adminv2-ws-wu-queue-card[data-queue-row-active="true"]');
    });

    it("scopes every compressed rule behind the runtime split attribute", () => {
        expect(RUNTIME_CSS).toContain('html[data-alloy-os-runtime-split="true"]');
        // the cue element is display:none unless split is active
        expect(RUNTIME_CSS).toMatch(/\.adminv2-ws-wu-queue-card__os-compressed-cue\s*\{\s*display:\s*none/);
    });
});
