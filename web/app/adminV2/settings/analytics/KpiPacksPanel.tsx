"use client";

import { listMetricPacks } from "@/lib/metrics/packs";
import { kpiForMetric } from "@/lib/metrics/kpiRegistry";
import { getMetricDefinition } from "@/lib/metrics/registry";

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3 rounded-lg border border-alloy-forge/12 bg-white/80 p-4 shadow-sm">
            <div>
                <h2 className="text-sm font-semibold text-alloy-midnight">{title}</h2>
                {description ?
                    <p className="mt-1 max-w-3xl text-[11px] leading-snug text-alloy-midnight/55">{description}</p>
                :   null}
            </div>
            {children}
        </section>
    );
}

export default function KpiPacksPanel() {
    const packs = listMetricPacks();

    return (
        <div className="space-y-4" data-testid="kpi-packs-panel">
            {packs.map((pack) => {
                const isAvailable = pack.domainStatus === "available" && pack.metricKeys.length > 0;
                return (
                    <SettingsSection key={pack.key} title={pack.label} description={pack.description}>
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    isAvailable ? "bg-alloy-pine/10 text-alloy-pine" : "bg-alloy-stone/15 text-alloy-midnight/45"
                                }`}
                            >
                                {isAvailable ? "Active" : "Coming soon"}
                            </span>
                        </div>
                        {isAvailable ?
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Metrics
                                    </div>
                                    <ul className="mt-1 space-y-1">
                                        {pack.metricKeys.map((key) => {
                                            const def = getMetricDefinition(key);
                                            return (
                                                <li key={key} className="text-xs text-alloy-midnight/75">
                                                    <span className="font-medium">{def.label}</span>
                                                    <span className="text-alloy-midnight/45"> · {key}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                                <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        KPIs
                                    </div>
                                    <ul className="mt-1 space-y-1">
                                        {pack.metricKeys.map((key) => {
                                            const kpiKey = kpiForMetric(key);
                                            if (!kpiKey) {
                                                return (
                                                    <li key={key} className="text-xs text-alloy-midnight/45">
                                                        {getMetricDefinition(key).label} — no KPI target
                                                    </li>
                                                );
                                            }
                                            return (
                                                <li key={kpiKey} className="text-xs text-alloy-midnight/75">
                                                    {kpiKey}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                        :   <p className="mt-2 text-xs text-alloy-midnight/45">Pack metrics will appear here when enabled.</p>}
                    </SettingsSection>
                );
            })}
        </div>
    );
}
