import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("configured drawer actions", () => {

    it("send_form is seeded as a platform action definition", () => {
        const migration = readFileSync(resolve(webRoot, "../supabase/migrations/20260529200000_send_form_action.sql"), "utf8");
        expect(migration).toContain("'send_form'");
        expect(migration).toContain('"intent":"send_form"');

        const registry = read("lib/admin/actions/actionDefinitionRegistry.ts");
        expect(registry).toContain('key: "send_form"');
    });

    it("send_enrollment_packet is seeded as a platform action definition", () => {
        const migration = readFileSync(resolve(webRoot, "../supabase/migrations/20260529180000_send_enrollment_packet_action.sql"), "utf8");
        expect(migration).toContain("'send_enrollment_packet'");
        expect(migration).toContain("'ui_intent'");
        expect(migration).toContain('"intent":"send_enrollment_packet"');

        const registry = read("lib/admin/actions/actionDefinitionRegistry.ts");
        expect(registry).toContain('key: "send_enrollment_packet"');
    });

    it("phase 3 enrollment actions route through registry client", () => {
        const client = read("lib/admin/actions/applyRegistryResolvedActionClient.ts");
        expect(client).toContain("review_enrollment_packet");
        expect(client).toContain("request_missing_information");
        expect(client).toContain("assign_classroom");
        expect(client).toContain("dispatchOpenEnrollmentPacketReview");
        expect(client).toContain("dispatchFocusInquiryChildren");

        const migration = readFileSync(
            resolve(webRoot, "../supabase/migrations/20260602200000_phase3_enrollment_canonical_action_alignment.sql"),
            "utf8"
        );
        expect(migration).toContain("'review_enrollment_packet'");
        expect(migration).toContain("'request_missing_information'");
        expect(migration).toContain("'assign_classroom'");
    });

    it("header overexposure fix deactivates universal default header placements", () => {
        const migration = readFileSync(
            resolve(webRoot, "../supabase/migrations/20260602210000_fix_opportunity_header_action_overexposure.sql"),
            "utf8"
        );
        expect(migration).toContain("'send_email'");
        expect(migration).toContain("is_active = false");
    });

    it("drawer header resolver sorts actions by placement order_index", () => {
        const resolver = read("lib/admin/actions/resolveActionsForContext.ts");
        expect(resolver).toContain("order_index");
        expect(resolver).toMatch(/sort\([\s\S]*_order[\s\S]*label\.localeCompare/);
    });

    it("settings Edit opens modal editor with label, enabled, placement, and sort order", () => {
        const editor = read("components/adminV2/settings/ActionPlacementGuidedEditor.tsx");
        expect(editor).toContain("action-placement-guided-editor-backdrop");
        expect(editor).toContain("Sort order");
        expect(editor).toContain("/api/admin/action-definitions/");
        expect(editor).toContain("seed.slot");

        const settings = read("components/adminV2/settings/ActionPlacementsSettingsClient.tsx");
        expect(settings).toContain("openEdit");
        expect(settings).toContain("slot: row.slot");
        expect(settings).toContain("reorderPlacement");
    });

    it("settings list exposes order controls", () => {
        const list = read("components/adminV2/settings/ConfiguredActionPlacementsList.tsx");
        expect(list).toContain("Sort order:");
        expect(list).toContain("action-placement-move-up-");
        expect(list).toContain("onReorder");
    });

    it("resolveActionsForContext assigns lower order_index first within a slot", async () => {
        const rows = [
            {
                id: "p2",
                surface: "record_header",
                slot: "secondary",
                org_id: null,
                entity_type: "opportunity",
                department_id: null,
                work_unit_id: null,
                section_key: null,
                order_index: 20,
                display_style: "button",
                condition_config: null,
                action_definitions: {
                    id: "d2",
                    org_id: null,
                    key: "send_enrollment_packet",
                    label: "Send enrollment packet",
                    description: null,
                    entity_type: "opportunity",
                    action_type: "ui_intent",
                    icon: null,
                    style: null,
                    priority: 78,
                    condition_config: null,
                    payload_schema: { intent: "send_enrollment_packet" },
                    workflow_id: null,
                    is_active: true,
                },
            },
            {
                id: "p1",
                surface: "record_header",
                slot: "secondary",
                org_id: null,
                entity_type: "opportunity",
                department_id: null,
                work_unit_id: null,
                section_key: null,
                order_index: 10,
                display_style: "button",
                condition_config: null,
                action_definitions: {
                    id: "d1",
                    org_id: null,
                    key: "schedule_tour",
                    label: "Schedule tour",
                    description: null,
                    entity_type: "opportunity",
                    action_type: "open_form",
                    icon: null,
                    style: null,
                    priority: 55,
                    condition_config: null,
                    payload_schema: { form_key: "schedule_tour" },
                    workflow_id: null,
                    is_active: true,
                },
            },
        ];

        const supabase = {
            from(table: string) {
                if (table === "action_placements") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    or: async () => ({ data: rows, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "opportunities") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { status_key: "new", metadata: {} },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        };

        const resolved = await resolveActionsForContext(supabase as never, {
            orgId: "org-1",
            surface: "record_header",
            entityType: "opportunity",
            entityId: "opp-1",
        });

        expect(resolved.secondary.map((a) => a.key)).toEqual(["schedule_tour", "send_enrollment_packet"]);
    });
});
