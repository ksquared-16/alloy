import Link from "next/link";
import ActionInventoryDiagnosticsClient from "@/components/adminV2/settings/ActionInventoryDiagnosticsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsActionsPage() {
    return (
        <div className="w-full max-w-5xl space-y-4 pb-2">
            <header className="rounded-xl border border-dashed border-alloy-forge/25 bg-alloy-stone/[0.04] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-alloy-midnight/40">Diagnostics</p>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Action buttons</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-alloy-midnight/60">
                    Reference for where buttons are configured to appear. This is not a settings editor.
                </p>
                <p className="mt-2 text-xs text-alloy-midnight/45">
                    <Link href="/adminV2/settings" className="font-medium text-alloy-pine hover:underline">
                        ← Back to Settings
                    </Link>
                </p>
            </header>
            <ActionInventoryDiagnosticsClient />
        </div>
    );
}
