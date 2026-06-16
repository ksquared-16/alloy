/**
 * Layout Gallery model helpers — Phase 2.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    rollbackCandidateVersions,
    summarizeSurfaceLayoutRecords,
} from "@/lib/layout/layoutGalleryModel";
import { buildSurfaceLayoutRegistryResponse } from "@/lib/layout/surfaceLayoutRegistry";

const root = resolve(__dirname, "../..");

function row(partial: Partial<EntityLayoutRecord> & Pick<EntityLayoutRecord, "id" | "version" | "status">): EntityLayoutRecord {
    return {
        id: partial.id,
        orgId: partial.orgId !== undefined ? partial.orgId : "org-1",
        industryKey: null,
        entityType: partial.entityType ?? "opportunities",
        surface: partial.surface ?? "drawer",
        layoutKey: partial.layoutKey ?? "default",
        name: partial.name ?? "Layout",
        version: partial.version,
        status: partial.status,
        isSystemDefault: partial.isSystemDefault ?? false,
        doc: partial.doc ?? { formatVersion: 1, surface: "drawer", entityType: "opportunities", sections: [] },
        metadata: partial.metadata ?? null,
        createdBy: null,
        createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
        updatedAt: partial.updatedAt ?? null,
        publishedAt: partial.publishedAt ?? null,
    };
}

describe("layoutGalleryModel", () => {
    it("summarizes org published + draft for opportunity drawer identity", () => {
        const identity = { entityType: "opportunities", surface: "drawer" as const, layoutKey: "default" };
        const records = [
            row({ id: "sys-1", orgId: null, version: 1, status: "published", isSystemDefault: true }),
            row({ id: "pub-2", orgId: "org-1", version: 2, status: "published", publishedAt: "2026-02-01T00:00:00Z" }),
            row({ id: "draft-3", orgId: "org-1", version: 3, status: "draft" }),
        ];
        const summary = summarizeSurfaceLayoutRecords(records, "org-1", identity);
        expect(summary.published?.id).toBe("pub-2");
        expect(summary.latestDraft?.id).toBe("draft-3");
        expect(summary.editTargetId).toBe("draft-3");
        expect(summary.duplicateSourceId).toBe("sys-1");
    });

    it("lists rollback candidates older than current published version", () => {
        const current = row({ id: "pub-3", version: 3, status: "published" });
        const candidates = rollbackCandidateVersions(
            [
                row({ id: "pub-1", version: 1, status: "published" }),
                current,
                row({ id: "pub-2", version: 2, status: "published" }),
                row({ id: "draft-4", version: 4, status: "draft" }),
            ],
            current,
        );
        expect(candidates.map((c) => c.version)).toEqual([2, 1]);
    });
});

describe("layouts settings gallery wiring", () => {
    it("registry payload includes enabled opportunity drawer and coming-soon surfaces", () => {
        const payload = buildSurfaceLayoutRegistryResponse();
        expect(payload.enabled.map((s) => s.surface_key)).toEqual(["opportunity_drawer"]);
        expect(payload.coming_soon.map((s) => s.surface_key)).toEqual([
            "person_drawer",
            "child_drawer",
            "queue_record",
            "communications_command_center",
            "pos_workspace",
        ]);
    });

    it("layouts page mounts gallery client as primary UX", () => {
        const page = readFileSync(resolve(root, "app/adminV2/settings/layouts/page.tsx"), "utf8");
        expect(page).toContain("LayoutsSettingsPageClient");
        expect(page).not.toContain("<LayoutConfigClient");
    });

    it("gallery client loads registry and entity layouts APIs", () => {
        const gallery = readFileSync(resolve(root, "components/adminV2/settings/LayoutGalleryClient.tsx"), "utf8");
        expect(gallery).toContain("/api/admin/surface-layouts/registry");
        expect(gallery).toContain("/api/admin/entity-layouts");
        expect(gallery).toContain("/duplicate");
        expect(gallery).toContain("/rollback");
        expect(gallery).toContain('data-testid="layout-gallery"');
    });
});
