/**
 * Developer-only: print OI QA fixture matrix. Does not mutate production data.
 * Wire org-specific seeds through existing admin capacity/enrollment tools.
 *
 *   cd web && npx tsx scripts/qa/seedOiUtilizationFixtures.ts
 */
import {
    OI_QA_FIXTURE_PREFIX,
    OI_QA_UTILIZATION_MATRIX,
    oiQaRoomLabel,
} from "../../lib/operationalQuestions/oiQaFixtures";

console.log(`${OI_QA_FIXTURE_PREFIX} utilization fixture matrix (non-destructive reference)`);
for (const row of OI_QA_UTILIZATION_MATRIX) {
    console.log(
        `- ${oiQaRoomLabel(row.slug)}: capacity=${row.capacity ?? "missing"} occupancy=${row.occupancy} expected≈${row.targetPct ?? "n/a"}%`,
    );
}
console.log("Create these rooms/capacity/enrollments via admin tools; do not mix into production examples.");
