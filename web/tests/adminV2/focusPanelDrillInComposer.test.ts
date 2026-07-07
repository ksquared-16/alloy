/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import {
    hasExplicitSurfaceHeaderSummaryMetadata,
    readSurfaceHeaderSummaryConfig,
} from "@/lib/adminV2/settings/surfaces/surfaceHeaderSummaryModel";
import {
    withSurfaceHeaderSummaryMetadata,
} from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import {
    formatSurfaceHeaderSummaryLine,
    resolveSurfaceHeaderSummarySegments,
} from "@/lib/adminV2/runtime/surfaceHeader/resolveSurfaceHeaderSummary";
import {
    applyHouseholdDisplayView,
    householdDisplayViewFromConfig,
    readHouseholdNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceRuntime";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import { HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import { defaultNestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { FOCUS_PANEL_SUMMARY_ENTITY_TYPE, FOCUS_PANEL_SUMMARY_LAYOUT_KEY, FOCUS_PANEL_SUMMARY_SURFACE } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc } from "@/lib/layout/layoutV2";
import { ensureRuntimeSurfacesRegistered, focusPanelNestedLaunchers } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

describe("explicit empty header summary config", () => {
    it("respects published empty renderers at runtime (no default fallback)", () => {
        const doc: LayoutDoc = {
            formatVersion: LAYOUT_DOC_FORMAT_VERSION,
            surface: FOCUS_PANEL_SUMMARY_SURFACE,
            entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
            sections: [],
            metadata: withSurfaceHeaderSummaryMetadata({ layoutKey: FOCUS_PANEL_SUMMARY_LAYOUT_KEY }, { renderers: [] }),
        };
        expect(hasExplicitSurfaceHeaderSummaryMetadata(doc)).toBe(true);
        expect(readSurfaceHeaderSummaryConfig(doc)?.renderers).toEqual([]);
        const segments = resolveSurfaceHeaderSummarySegments({
            publishedDoc: doc,
            record: {
                "person.primary_contact_name": "Kelly Kurzman",
                _inquiry_children: [{ display_name: "Child", age: "2y" }],
            },
        });
        expect(segments).toEqual([]);
        expect(formatSurfaceHeaderSummaryLine(segments)).toBeNull();
    });

    it("still uses defaults when metadata key is absent", () => {
        const segments = resolveSurfaceHeaderSummarySegments({
            publishedDoc: null,
            record: { "person.primary_contact_name": "Kelly Kurzman" },
        });
        expect(segments.length).toBeGreaterThan(0);
    });
});

describe("household nested surface runtime", () => {
    const demoContext = {
        truth: {
            "person.primary_contact_name": "Jordan Johnson",
            "person.primary_phone": "5415550100",
            "person.primary_email": "jordan@example.com",
            _inquiry_children: [{ id: "c1", display_name: "Lennon Johnson", age: "2y 3m", dob: "Mar 2024" }],
            _opportunity_persons: [],
        },
        subject: { type: "opportunity", id: "demo", label: "Demo" },
        capabilities: { maskedChannels: false },
    } as unknown as OperationalContext;

    it("registers household detail surface in nested launchers", () => {
        ensureRuntimeSurfacesRegistered();
        const ids = focusPanelNestedLaunchers().map((l) => l.surfaceId);
        expect(ids).toContain(HOUSEHOLD_SURFACE_ID);
    });

    it("hides groups and toggles contact channels from published config", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const patched = {
            ...config,
            groups: config.groups.map((g) =>
                g.key === "emergency_contacts"
                    ? { ...g, displayOptions: { visible: false } }
                    : g.key === "primary_contact"
                      ? { ...g, displayOptions: { showPhone: true, showEmail: false } }
                      : g,
            ),
        };
        const view = householdDisplayViewFromConfig(patched, null);
        expect(view.hiddenGroups.has("emergency_contacts")).toBe(true);
        expect(view.contactDisplay.showEmail).toBe(false);

        const base = buildHouseholdCardEvidence(demoContext);
        const applied = applyHouseholdDisplayView(base, view);
        expect(applied.groups.some((g) => g.key === "emergency_contacts")).toBe(false);
    });

    it("reads household config from published doc metadata", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const doc = {
            metadata: { nestedSurfaces: { [HOUSEHOLD_SURFACE_ID]: config } },
        } as unknown as LayoutDoc;
        expect(readHouseholdNestedConfigFromDoc(doc)?.surfaceId).toBe(HOUSEHOLD_SURFACE_ID);
    });
});

describe("queue row frozen guard", () => {
    it("Queue Row builder does not import household nested runtime", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(
            resolve(here, "../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx"),
            "utf8",
        );
        expect(src).not.toContain("householdNestedSurfaceRuntime");
        expect(src).not.toContain("NestedSurfaceRuntimeCanvas");
    });
});
