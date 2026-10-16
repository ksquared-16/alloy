/** @vitest-environment jsdom */
/**
 * A queue row on a surface nobody has configured shows the household, primary contact, phone and
 * each child's name and age.
 *
 * The regression: an unpublished process queue row resolved to the builder's EMPTY starting layout,
 * and an empty layout maps to "every secondary slot hidden" — the row rendered the household name
 * and nothing else, though contact, phone and children were all on the row context.
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { CondensedQueueRow } from "@/components/presentation/workUnit/CondensedQueueRow";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime";
import { runtimeQueueRowConfig } from "@/lib/layout/runtime/queueRowLayoutServer";
import {
    defaultRuntimeQueueRowLayoutV3,
    emptyQueueRowLayoutV3,
    queueRowLayoutHasNoFields,
    starterEnrollmentQueueRowVariants,
} from "@/lib/layout/queueRecordLayoutDefaults";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return container;
}
afterEach(() => {
    container?.remove();
    container = null;
});

const TWO_YEARS_AGO = new Date(Date.now() - 2.2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

/** The reported family, as enrichment delivers it. */
function fifteenHousehold(): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-15", display_name: "Fifteen Household" },
        row_stage: "New",
        lifecycle_key: "enrollment",
        row_status_key: "new_lead",
        row_status_label: "New Lead",
        case_context: {
            case_id: "opp-15",
            display_name: "Fifteen Household",
            case_type_label: "Enrollment",
            case_status_key: "new_lead",
            case_status_label: "New Lead",
        },
        primary_contact: { display_name: "Father Fifteen", phone: "5035550115", email: "father@fifteen.test" },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-15",
                display_name: "Kiddo Fifteen",
                status_label: "Inquiry",
                date_of_birth: TWO_YEARS_AGO,
            },
        ],
        attention_summary: { needs_attention: false, primary_reason_label: null },
        work_summary: { open_count: 0, primary_open_label: null },
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-15" },
    } as unknown as QueueRowContext;
}

function renderRow(config: ReturnType<typeof runtimeQueueRowConfig>) {
    const slots = mapQueueRowSurfaceToCompactConfig(config).slots;
    return render(
        <CondensedQueueRow
            row={{ context: fifteenHousehold(), entityType: "opportunity", entityId: "opp-15" }}
            rowConfig={slots}
            onOpen={vi.fn()}
        />,
    );
}

describe("unconfigured queue row surface", () => {
    it("THE REGRESSION: the builder's empty layout, rendered as is, shows only the household", () => {
        const text = renderRow(emptyQueueRowLayoutV3()).textContent ?? "";
        expect(text).toContain("Fifteen Household");
        expect(text).not.toContain("Father Fifteen");
        expect(text).not.toContain("Kiddo");
    });

    it("the runtime renders the default instead: household, primary contact, phone, child name and age", () => {
        const config = runtimeQueueRowConfig(null, emptyQueueRowLayoutV3());
        expect(queueRowLayoutHasNoFields(config)).toBe(false);
        const text = renderRow(config).textContent ?? "";
        expect(text).toContain("Fifteen Household");
        expect(text).toContain("Father Fifteen");
        expect(text).toMatch(/555[\s\-.)]*0115/);
        expect(text).toContain("Kiddo Fifteen");
        expect(text).toMatch(/2y/);
        // Email is not part of the default row.
        expect(text).not.toContain("father@fifteen.test");
    });

    it("a field-less PUBLISHED layout (predates the publish guard) also gets the default", () => {
        const config = runtimeQueueRowConfig(emptyQueueRowLayoutV3(), emptyQueueRowLayoutV3());
        const keys = (c: typeof config) =>
            c.columns.flatMap((col) => col.blocks.flatMap((b) => ("fields" in b ? b.fields.map((f) => f.fieldKey) : [])));
        expect(keys(config)).toEqual(keys(defaultRuntimeQueueRowLayoutV3()));
    });

    it("only Default columns are substituted — authored variants keep applying", () => {
        const withVariants = { ...emptyQueueRowLayoutV3(), variants: starterEnrollmentQueueRowVariants() };
        const config = runtimeQueueRowConfig(withVariants, emptyQueueRowLayoutV3());
        expect(config.variants?.map((v) => v.id)).toEqual(withVariants.variants.map((v) => v.id));
        expect(queueRowLayoutHasNoFields(config)).toBe(false);
    });

    it("an authored layout is never replaced", () => {
        const authored = defaultLeadQueueLayoutV3();
        expect(runtimeQueueRowConfig(authored, emptyQueueRowLayoutV3())).toBe(authored);
    });

    it("the in-page overlay reads the runtime layout, not the builder envelope", () => {
        const src = readFileSync(
            path.join(process.cwd(), "lib/presentation/runtime/usePublishedQueueRowSlotsOverlay.ts"),
            "utf8",
        );
        expect(src).toContain("mapQueueRowSurfaceToCompactConfig(loaded.runtimeLayout)");
        expect(src).not.toContain("mapQueueRowSurfaceToCompactConfig(loaded.envelope.layout)");
    });
});

describe("row content is commit-critical", () => {
    it("the commit frame waits for the enriched cohort (contact, phone, children) before building rows", () => {
        const src = readFileSync(
            path.join(process.cwd(), "lib/runtime/provisioning/workUnitProvisioningAnswer.ts"),
            "utf8",
        );
        const commit = src.slice(src.indexOf('await joinWait("commit_presentation"'));
        const awaitAt = commit.indexOf('await joinWait(\n        "cohort_rows"');
        const buildAt = commit.indexOf("const rows = buildQueueRows(");
        expect(awaitAt).toBeGreaterThan(-1);
        expect(buildAt).toBeGreaterThan(awaitAt);
        // Observed-not-awaited is gone: no settled ref is read at the commit boundary.
        expect(src).not.toContain("enrichedSettled");
    });
});
