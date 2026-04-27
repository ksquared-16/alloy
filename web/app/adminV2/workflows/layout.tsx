import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function AdminV2WorkflowsLayout({ children }: { children: React.ReactNode }) {
    return <Suspense fallback={<div className="p-4 text-sm text-alloy-midnight/70">Loading…</div>}>{children}</Suspense>;
}
