export const dynamic = "force-dynamic";

export default function AdminV2SettingsAttentionSlaRulesPage() {
    return (
        <div className="w-full max-w-4xl">
            <div className="rounded-xl border border-alloy-forge/12 bg-white/60 p-4 shadow-sm">
                <div className="text-sm font-semibold text-alloy-midnight">Attention & SLA Rules</div>
                <div className="mt-1 text-xs leading-snug text-alloy-midnight/60">
                    Coming next. This will configure time-based and data-completeness rules (e.g. contact attempt within 48 hours) that feed the
                    “Needs Attention” lane for work units.
                </div>
            </div>
        </div>
    );
}

