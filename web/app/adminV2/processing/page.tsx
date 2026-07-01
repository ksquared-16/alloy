export const dynamic = "force-dynamic";

import ProcessingQueueClient from "@/app/adminV2/processing/ProcessingQueueClient";

/** POS-FP3 — Processing Workspace (read-only). Canonical product URL: /admin/processing. */
export default function AdminV2ProcessingPage() {
    return <ProcessingQueueClient />;
}
