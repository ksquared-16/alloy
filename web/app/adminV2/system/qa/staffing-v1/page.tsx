import StaffingV1QaClient from "./StaffingV1QaClient";

/**
 * STAFFING / SCHEDULING / COVERAGE V1 — HUMAN ACCEPTANCE QA.
 *
 * Reached at /workspace/qa/staffing-v1, rewritten to this implementation in next.config.ts —
 * the same placement Core Financials Director QA uses, for the same reason: `/workspace` is
 * the canonical operator base, the middleware's operator gate protects everything beneath it,
 * and the adminV2 layout above this page already refuses anyone without a session and a role.
 * No new route family, no second QA application, no parallel authentication.
 *
 * The page holds no state and no staffing logic. Fixture health is resolved live by
 * /api/admin/qa/staffing-v1 through the same projection the Calendar reads, and the
 * walkthrough itself happens in the real product.
 */
export const dynamic = "force-dynamic";

export default function StaffingV1QaPage() {
    return <StaffingV1QaClient />;
}
