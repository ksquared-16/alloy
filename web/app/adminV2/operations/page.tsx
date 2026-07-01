export const dynamic = "force-dynamic";

export default function AdminV2OperationsPage() {
    return (
        <div className="w-full max-w-4xl space-y-3 pb-2">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Operations</h1>
                <p className="mt-1 text-xs text-alloy-midnight/60">Coming next: AdminV2 operations navigation.</p>
            </header>
            <div className="rounded-xl border border-alloy-stone/15 bg-white/60 px-4 py-3 text-sm text-alloy-midnight/70 space-y-2">
                <p>This area is not migrated to AdminV2 yet.</p>
                <p className="text-xs text-alloy-midnight/55">
                    Task notifications (V1): in-app badge on the top nav and{" "}
                    <a href="/admin/tasks" className="font-semibold text-alloy-blue hover:underline">
                        My tasks
                    </a>
                    . Planned later: email digest, SMS/Slack, push.
                </p>
            </div>
        </div>
    );
}

