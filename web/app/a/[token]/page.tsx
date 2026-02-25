/**
 * Action-link landing page: /a/[token]
 * Reads token from params, shows "Processing…" and token/placeholder.
 * No existing API for action-link consumption; no business logic added.
 */
export default async function ActionTokenPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-alloy-stone/10">
            <div className="bg-white rounded-lg border border-alloy-stone/20 shadow-sm p-8 max-w-md w-full text-center">
                <p className="text-alloy-midnight font-medium mb-2">Processing…</p>
                <p className="text-sm text-alloy-midnight/60 break-all">
                    Token: {token || "—"}
                </p>
                <p className="text-xs text-alloy-midnight/50 mt-4">
                    Action link handler not configured.
                </p>
            </div>
        </div>
    );
}
