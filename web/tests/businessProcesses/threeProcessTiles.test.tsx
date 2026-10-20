/** @vitest-environment jsdom */

/**
 * BP V2 Slice 1 — the three process tiles RENDERED through the existing ProcessSummaryCard, from the
 * same catalog → landing card → tile model chain the Workspace runs. Before = Enrollment alone (the
 * deployed configuration); after = Enrollment + Assignments + Billing.
 *
 * Set BPV2_S1_RENDER_EVIDENCE=<dir> to also write the rendered HTML there (certification evidence).
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) => (
        <a href={typeof href === "string" ? href : "#"} {...rest}>
            {children}
        </a>
    ),
}));

import { ProcessSummaryCard } from "@/components/presentation/workspace/ProcessSummaryCard";
import { buildOperatorLifecycleLandingCards } from "@/lib/admin/buildOperatorLifecycleLanding";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { catalogEntriesFromDepartmentRows } from "@/lib/lifecycle/lifecycleCatalog";
import { processTileModelFromLandingCard } from "@/lib/presentation/runtime/types";
import { DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

const ENROLLMENT_DEPT = "11111111-1111-4111-8111-111111111111";
const ASSIGNMENTS_DEPT = "22222222-2222-4222-8222-222222222222";
const BILLING_DEPT = "33333333-3333-4333-8333-333333333333";

function dept(id: string, key: string, name: string, process: Record<string, unknown>) {
    return {
        id,
        key,
        name,
        is_active: true,
        metadata: { lifecycle_builder_v1: { version: 1, active_process_id: process.id, processes: [process] } },
    };
}

const enrollment = dept(ENROLLMENT_DEPT, "lead_management", "Enrollment", {
    id: "proc-enrollment",
    key: "enrollment",
    name: "Enrollment",
    primary_entity: "opportunity",
    is_active: true,
    stages: [{ id: "s-lead", key: "lead", label: "Lead", sort_order: 0, is_active: true }],
    work_views_v1: [
        { id: "new_leads", label: "New Leads", compat_queue_key: "new_leads", display_order: 0 },
        { id: "tours", label: "Tours", compat_queue_key: "tours", display_order: 1 },
    ],
});
const projection = (id: string, domain: "assignments" | "billing", name: string, description: string) =>
    dept(id, domain, name, {
        id: `proc-${domain}`,
        key: domain,
        name,
        description,
        process_model_v1: { kind: "domain_projection", domain },
        is_active: true,
        stages: [],
    });
const assignments = projection(ASSIGNMENTS_DEPT, "assignments", "Assignments", "Assignment and scheduling review.");
const billing = projection(BILLING_DEPT, "billing", "Billing", "Billing exceptions and director review.");

function tiles(rows: ReturnType<typeof dept>[]) {
    const catalogEntries = catalogEntriesFromDepartmentRows(rows, {
        workspaceById: new Map(rows.map((d) => [d.id, { name: d.name }])),
        wuCountByDept: new Map(),
        departmentIdAllowed: () => true,
    });
    return buildOperatorLifecycleLandingCards({
        catalogEntries,
        departments: rows,
        workUnits: [
            {
                id: "wu-pipeline",
                department_id: ENROLLMENT_DEPT,
                key: "enrollment_pipeline",
                name: "Enrollment Pipeline",
                queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
            },
        ],
    }).map((card) => processTileModelFromLandingCard(card));
}

let container: HTMLElement | null = null;
function renderGrid(rows: ReturnType<typeof dept>[]): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
        root.render(
            <div data-evidence-grid>
                {tiles(rows).map((p) => (
                    <ProcessSummaryCard key={p.id} process={p} config={DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG} />
                ))}
            </div>,
        ),
    );
    return container;
}
afterEach(() => {
    container?.remove();
    container = null;
});

function writeEvidence(name: string, el: HTMLElement) {
    const dir = process.env.BPV2_S1_RENDER_EVIDENCE;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), `<!doctype html>\n<meta charset="utf-8">\n${el.innerHTML}\n`);
}

describe("three process tiles rendered through the existing ProcessSummaryCard", () => {
    it("BEFORE (deployed configuration): one Enrollment tile", () => {
        const el = renderGrid([enrollment]);
        writeEvidence("workspace-before-enrollment-only.html", el);
        const cards = el.querySelectorAll("article");
        expect(cards).toHaveLength(1);
        expect(cards[0]!.querySelector("[data-process-title]")?.textContent).toBe("Enrollment");
    });

    it("AFTER: Enrollment unchanged, plus Assignments and Billing as their own tiles", () => {
        const before = renderGrid([enrollment]).querySelector("article")!.outerHTML;
        container?.remove();
        const el = renderGrid([enrollment, assignments, billing]);
        writeEvidence("workspace-after-three-processes.html", el);

        const cards = [...el.querySelectorAll("article")];
        expect(cards.map((c) => c.querySelector("[data-process-title]")?.textContent)).toEqual([
            "Assignments",
            "Billing",
            "Enrollment",
        ]);

        // Enrollment: byte-identical markup to the BEFORE render — same CTA, same Today's Work rows.
        const enrollmentCard = cards.find((c) => c.getAttribute("data-process-id")?.startsWith(ENROLLMENT_DEPT))!;
        expect(enrollmentCard.outerHTML).toBe(before);
        expect(enrollmentCard.querySelector("a[data-process-cta]")?.getAttribute("href")).toBe("/workspace/work-unit/new-leads");
        expect(enrollmentCard.querySelector("[data-process-todays-work]")?.textContent).toContain("New Leads");

        for (const deptId of [ASSIGNMENTS_DEPT, BILLING_DEPT]) {
            const card = cards.find((c) => c.getAttribute("data-process-id")?.startsWith(deptId))!;
            // Nothing on the card navigates — no link into Enrollment, no link at all.
            expect(card.querySelectorAll("a")).toHaveLength(0);
            expect(card.querySelector("[data-process-unavailable]")?.textContent).toBe(
                "Work Views for this process are not available yet.",
            );
            // Honest empty states: no signal configured, no Today's Work, no fabricated zero.
            expect(card.querySelector("[data-process-answer]")?.textContent).toBe("No signal configured yet");
            expect(card.querySelector("[data-process-todays-work]")).toBeNull();
            expect(card.textContent).not.toMatch(/\b0\b/);
            expect(card.innerHTML).not.toMatch(/new-leads|new_leads/);
        }
    });
});
