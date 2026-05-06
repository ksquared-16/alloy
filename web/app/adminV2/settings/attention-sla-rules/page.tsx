export const dynamic = "force-dynamic";

export default function AdminV2SettingsAttentionSlaRulesPage() {
    return (
        <div className="w-full max-w-4xl space-y-3">
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-900/70">Not active yet</div>
                <div className="mt-1 text-sm font-semibold text-alloy-midnight">Attention &amp; SLA Rules</div>
                <div className="mt-2 space-y-2 text-xs leading-snug text-alloy-midnight/70">
                    <p>
                        This screen is <span className="font-medium text-alloy-midnight">planned</span>. There is no tenant UI here that
                        currently changes production &quot;Needs attention&quot; behavior.
                    </p>
                    <p>
                        <span className="font-medium text-alloy-midnight">Today:</span> opportunity Needs attention membership and reasons
                        are evaluated in application code by the canonical <code className="rounded bg-alloy-stone/15 px-1 py-0.5 text-[10px]">resolveOpportunityAttention</code>{" "}
                        resolver (<strong className="font-medium">v2</strong>). Tunable thresholds and policy-style flags live under{" "}
                        <code className="rounded bg-alloy-stone/15 px-1 py-0.5 text-[10px]">opportunity_attention_rules</code> in work-unit or
                        department <code className="rounded bg-alloy-stone/15 px-1 py-0.5 text-[10px]">metadata</code>; per-opportunity wait facet{" "}
                        <code className="rounded bg-alloy-stone/15 px-1 py-0.5 text-[10px]">enrollment_operational</code> is validated on admin
                        opportunity PATCH (not this page).
                    </p>
                    <p className="text-[10px] text-alloy-midnight/50">
                        Count / lane semantics: <code className="rounded bg-alloy-stone/10 px-1">docs/execution/crm-opportunity-needs-attention-count-semantics.md</code>
                    </p>
                </div>
            </div>
        </div>
    );
}
