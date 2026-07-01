export const dynamic = "force-dynamic";

import ProcessingQueueClient from "@/app/adminV2/processing/ProcessingQueueClient";

/**
 * POS-FP4/FP-W — deep-link / refresh restore for the standalone Processing surface.
 * The `:caseId` is server-known from the route param and passed in as the initial
 * selection (no window read, no setState-in-effect). Drawer opens for that case.
 */
export default async function ProcessingCaseDeepLinkPage({
    params,
}: {
    params: Promise<{ caseId: string }>;
}) {
    const { caseId } = await params;
    return <ProcessingQueueClient initialCaseId={caseId} />;
}
