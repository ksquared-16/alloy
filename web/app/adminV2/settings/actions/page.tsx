import Link from "next/link";
import ActionPlacementsSettingsClient from "@/components/adminV2/settings/ActionPlacementsSettingsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsActionsPage() {
    return (
        <div className="w-full max-w-5xl space-y-4 pb-2">
            <header className="rounded-xl border border-alloy-forge/25 bg-alloy-stone/[0.04] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-alloy-midnight/40">Button placement</p>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Action buttons</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-alloy-midnight/60">
                    Choose which buttons appear on record surfaces and where they show up. Labels and enablement for your
                    organization can be edited here; what a button does when clicked is configured in Automations.
                </p>
                <p className="mt-2 text-xs text-alloy-midnight/45">
                    <Link href="/adminV2/settings" className="font-medium text-alloy-pine hover:underline">
                        ← Back to Settings
                    </Link>
                </p>
            </header>
            <ActionPlacementsSettingsClient />
        </div>
    );
}
