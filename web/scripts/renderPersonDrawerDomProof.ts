/**
 * Renders Person drawer DOM proof HTML for operator verification.
 * Run: cd web && npx tsx scripts/renderPersonDrawerDomProof.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import PersonOverviewRuntimeComposition from "@/components/layout/person/PersonOverviewRuntimeComposition";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";
import { applySectionRowLayoutWithResult } from "@/lib/layout/layoutEditorSectionLayout";
import { sliceLayoutDocSections } from "@/lib/layout/runtime/personOverviewComposition";

function multiAdultPersonRecord() {
    return buildProofPersonRecord({
        id: "parent-1",
        customer_id: "cust-1",
        "person.id": "parent-1",
        "person.primary_contact_name": "Jamie Johnson",
        _household_context: [{ customer_id: "cust-1", household_name: "Johnson Household" }],
        _household_adult_links: [
            {
                customer_id: "cust-1",
                person_id: "parent-1",
                display_name: "Jamie Johnson",
                role_type: "parent",
                role_label: "Parent",
                is_primary: true,
            },
            {
                customer_id: "cust-1",
                person_id: "parent-2",
                display_name: "Molly Wright",
                role_type: "guardian",
                role_label: "Guardian",
            },
        ],
        notes: [{ title: "Follow-up", body: "Called about enrollment", created_at: "2026-06-01T12:00:00Z" }],
    });
}

const record = multiAdultPersonRecord();
let doc = buildPersonDrawerDefaultDoc();

// Simulate Builder row layout: contact left, stacked right (needs 3 sections in main zone)
const rowLayoutResult = applySectionRowLayoutWithResult(doc, "contact_information", "half_stacked_right", {
    surfaceKey: "person_drawer",
});
doc = rowLayoutResult.doc;

const compositionHtml = renderToStaticMarkup(
    React.createElement(PersonOverviewRuntimeComposition, {
        doc,
        record,
        entityId: "parent-1",
        canMutate: true,
    }),
);

const activityHtml = renderToStaticMarkup(
    React.createElement(
        "div",
        { "data-proof": "activity-section" },
        // Activity section slice rendered via composition right rail
        compositionHtml.includes("data-layout-runtime-standalone-widget") ?
            "<!-- activity standalone marker present in composition -->"
        :   "<!-- activity collapsed empty -->",
    ),
);

const proof = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Person Drawer DOM Proof</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; background: #f6f8fc; }
    .proof-banner { background: #18273a; color: #fff; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }
    .marker { font-family: ui-monospace, monospace; font-size: 12px; padding: 4px 8px; border-radius: 4px; background: #e8f5f1; margin: 4px 0; }
    .marker.missing { background: #fde8e8; }
  </style>
</head>
<body>
  <div class="proof-banner">
    <strong>Person Drawer DOM Proof</strong> — generated ${new Date().toISOString()}
  </div>
  <h2>DOM markers (console checks)</h2>
  <div class="marker${compositionHtml.includes('data-debug-drawer-path="PersonOverviewRuntimeComposition"') ? "" : " missing"}">
    data-debug-drawer-path="PersonOverviewRuntimeComposition" → ${compositionHtml.includes('data-debug-drawer-path="PersonOverviewRuntimeComposition"') ? "FOUND" : "MISSING"}
  </div>
  <div class="marker${compositionHtml.includes('data-drawer-household-contacts-actionable="true"') ? "" : " missing"}">
    data-drawer-household-contacts-actionable → ${compositionHtml.includes('data-drawer-household-contacts-actionable="true"') ? "FOUND" : "MISSING"}
  </div>
  <div class="marker${compositionHtml.includes('data-drawer-household-make-primary-contact="true"') ? "" : " missing"}">
    data-drawer-household-make-primary-contact → ${compositionHtml.includes('data-drawer-household-make-primary-contact="true"') ? "FOUND" : "MISSING"}
  </div>
  <div class="marker${compositionHtml.includes('data-layout-runtime-standalone-widget="activity"') ? "" : " missing"}">
    data-layout-runtime-standalone-widget="activity" → ${compositionHtml.includes('data-layout-runtime-standalone-widget="activity"') ? "FOUND" : "MISSING (section may be collapsed when empty)"}
  </div>
  <div class="marker${compositionHtml.includes('data-layout-runtime-section-flow="true"') ? "" : " missing"}">
    data-layout-runtime-section-flow (section gap wrapper) → ${compositionHtml.includes('data-layout-runtime-section-flow="true"') ? "FOUND" : "MISSING"}
  </div>
  <div class="marker${compositionHtml.includes('flex flex-col gap-5') ? "" : " missing"}">
    gap-5 section spacing → ${compositionHtml.includes('flex flex-col gap-5') ? "FOUND" : "MISSING"}
  </div>
  <h2 class="mt-6">Rendered PersonOverviewRuntimeComposition</h2>
  <div class="rounded-lg border bg-white p-2">${compositionHtml}</div>
  <p class="mt-4 text-xs text-gray-500">${activityHtml}</p>
</body>
</html>`;

const outDir = join(process.cwd(), "tmp");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "person-drawer-dom-proof.html");
writeFileSync(outPath, proof, "utf8");
console.log(`Wrote ${outPath}`);
console.log(
    JSON.stringify(
        {
            PersonOverviewRuntimeComposition: compositionHtml.includes('data-debug-drawer-path="PersonOverviewRuntimeComposition"'),
            contactsActionable: compositionHtml.includes('data-drawer-household-contacts-actionable="true"'),
            makePrimary: compositionHtml.includes('data-drawer-household-make-primary-contact="true"'),
            activityStandalone: compositionHtml.includes('data-layout-runtime-standalone-widget="activity"'),
            gap5: compositionHtml.includes("gap-5"),
        },
        null,
        2,
    ),
);
