"use client";

import { useMemo, useState } from "react";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigReadonlyNotice } from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import { ConfigSecondaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import { formatCurrencyCents } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { useFinancialServices } from "@/components/adminV2/settings/financials/useFinancialServices";
import { useChargeTemplates } from "@/components/adminV2/settings/financials/useChargeTemplates";
import { useFinancialsConfigurationSettings } from "@/components/adminV2/settings/financials/useFinancialsConfigurationSettings";
import ServiceOperateView from "@/components/adminV2/settings/financials/services/ServiceOperateView";
import ServiceAuthorJourney, { type ServiceDraftInput } from "@/components/adminV2/settings/financials/services/ServiceAuthorJourney";
import type { FinancialService } from "@/lib/financials/services/financialServicesStore";
import { rhythmOf, SERVICE_RHYTHM_LABEL, type ServiceCapability } from "@/lib/financials/services/serviceCapabilities";
import { validateService } from "@/lib/financials/services/serviceValidation";
import { CHARGE_CATEGORY_GL_MAPPING_KEY, chargeCategoryLabel, listChargeCategories } from "@/lib/financials/chargeCategories";

/**
 * Services configuration — Alloy Services V1 (mode-adaptive Service workspace).
 * The frozen shell is constant; the Workspace takes one of three shapes:
 *   • OPERATE (Summary/Activity) — the connected switchboard canvas (returning state)
 *   • AUTHOR — question-first authoring (add / first-run)
 *   • LIST — the offering set, the operate spine
 * A Service is a switchboard, not a Name/Type/Description row. Configuration only —
 * it does not post money.
 */

const STARTER_SERVICES: ServiceDraftInput[] = [
    { label: "Full-Time Care", description: "Full-day care, five days a week.", service_type: "recurring", unit: "week", capabilities: { creates_schedule: true, tracks_attendance: true, consumes_capacity: true, supports_waitlist: true, uses_rate_plans: true, parent_portal_visible: true }, programs: [] },
    { label: "Before Care", description: "Morning care before the program day.", service_type: "recurring", unit: "week", capabilities: { creates_schedule: true, tracks_attendance: true, consumes_capacity: true, supports_waitlist: true, uses_rate_plans: true, parent_portal_visible: true }, programs: [] },
    { label: "After Care", description: "Afternoon care after the program day.", service_type: "recurring", unit: "week", capabilities: { creates_schedule: true, tracks_attendance: true, consumes_capacity: true, supports_waitlist: true, uses_rate_plans: true, parent_portal_visible: true }, programs: [] },
];

type Mode = { kind: "list" } | { kind: "operate"; id: string } | { kind: "author" };

export default function ServicesConfigurationPanel({ canMutate }: { canMutate: boolean }) {
    const { services, loading, error, busy, createService, updateService, setServiceActive } = useFinancialServices();
    const { templates } = useChargeTemplates();
    const { ratePlans, rateRules, glAccounts, glAccountMappings } = useFinancialsConfigurationSettings();
    const [mode, setMode] = useState<Mode>({ kind: "list" });

    const categoryOptions = useMemo(() => listChargeCategories().map((c) => ({ value: c.key, label: c.label })), []);

    // ---- relationship facts (read-through) ---------------------------------
    function factsFor(service: FinancialService) {
        const plans = ratePlans.filter((p) => p.service_id === service.id);
        const planIds = new Set(plans.map((p) => p.id));
        const planKeys = new Set(plans.map((p) => p.plan_key));
        const amounts = rateRules.filter((r) => planIds.has(r.rate_plan_id)).map((r) => r.amount_cents).filter((n) => typeof n === "number");
        let priceRange: string | null = null;
        if (amounts.length > 0) {
            const min = Math.min(...amounts);
            const max = Math.max(...amounts);
            const suffix = service.unit ? ` / ${service.unit}` : "";
            priceRange = min === max ? `${formatCurrencyCents(min, "USD")}${suffix}` : `${formatCurrencyCents(min, "USD")}–${formatCurrencyCents(max, "USD")}${suffix}`;
        }
        const chargeCount = new Set(templates.filter((t) => t.service_id === service.id).map((t) => t.template_key)).size;
        const categoryLabel = service.defaultChargeCategory ? chargeCategoryLabel(service.defaultChargeCategory) : null;
        let revenueAccountLabel: string | null = null;
        if (service.defaultChargeCategory) {
            const mappingKey = CHARGE_CATEGORY_GL_MAPPING_KEY[service.defaultChargeCategory as keyof typeof CHARGE_CATEGORY_GL_MAPPING_KEY];
            const mapping = mappingKey ? glAccountMappings.find((m) => m.key === mappingKey) : undefined;
            const account = mapping ? glAccounts.find((a) => a.id === mapping.gl_account_id) : undefined;
            if (account) revenueAccountLabel = `${account.code} ${account.name}`;
        }
        return { ratePlanCount: planKeys.size, priceRange, chargeCount, categoryLabel, revenueAccountLabel };
    }

    function hasAttention(service: FinancialService): boolean {
        const f = factsFor(service);
        return validateService({
            label: service.label,
            serviceType: service.serviceType,
            capabilities: service.capabilities,
            hasRatePlan: f.ratePlanCount > 0,
            hasRevenueHome: service.defaultChargeCategory != null,
        }).some((x) => x.severity === "attention");
    }

    // ---- mutation handlers --------------------------------------------------
    function toggleCapability(s: FinancialService, cap: ServiceCapability, value: boolean) {
        void updateService({ id: s.id, label: s.label, service_type: s.serviceType, capabilities: { [cap]: value } });
    }
    function changeCategory(s: FinancialService, category: string) {
        void updateService({ id: s.id, label: s.label, service_type: s.serviceType, default_charge_category: category || null });
    }
    function setPrograms(s: FinancialService, programs: string[]) {
        void updateService({ id: s.id, label: s.label, service_type: s.serviceType, programs });
    }
    function saveIdentity(s: FinancialService, patch: { label: string; description: string | null; unit: string | null }) {
        void updateService({ id: s.id, label: patch.label, service_type: s.serviceType, description: patch.description, unit: patch.unit });
    }
    async function seedStarters() {
        for (const draft of STARTER_SERVICES) {
            await createService({ ...draft });
        }
    }

    const selected = mode.kind === "operate" ? services.find((s) => s.id === mode.id) ?? null : null;

    // ---- render -------------------------------------------------------------
    return (
        <div className="space-y-3" data-testid="financials-services">
            <ConfigurationContext
                title="Services"
                subtitle="What your organization offers — and what each switches on"
                actions={
                    canMutate && mode.kind === "list" && services.length > 0 ? (
                        <ConfigurationPrimaryButton onClick={() => setMode({ kind: "author" })}>Add a service</ConfigurationPrimaryButton>
                    ) : mode.kind !== "list" ? (
                        <ConfigSecondaryButton onClick={() => setMode({ kind: "list" })}>← All services</ConfigSecondaryButton>
                    ) : undefined
                }
            />
            <ConfigReadonlyNotice testId="financials-services-notice">
                This is configuration. It does not post money. A Service is what you offer and what it switches on —
                scheduling, attendance, capacity, waitlist, pricing, and the parent portal.
            </ConfigReadonlyNotice>

            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}

            {loading ? (
                <ConfigurationEmptyState testId="financials-services-loading" title="Loading services" description="Fetching the service catalog." />
            ) : mode.kind === "author" ? (
                <ServiceAuthorJourney
                    canMutate={canMutate}
                    busy={busy}
                    onCancel={() => setMode({ kind: "list" })}
                    onCreate={(input) => {
                        void createService({
                            label: input.label,
                            description: input.description,
                            service_type: input.service_type,
                            unit: input.unit,
                            capabilities: input.capabilities,
                            programs: input.programs,
                        }).then(() => setMode({ kind: "list" }));
                    }}
                />
            ) : selected ? (
                <ServiceOperateView
                    service={selected}
                    canMutate={canMutate}
                    busy={busy}
                    {...factsFor(selected)}
                    categoryOptions={categoryOptions}
                    onToggleCapability={(cap, value) => toggleCapability(selected, cap, value)}
                    onChangeCategory={(category) => changeCategory(selected, category)}
                    onSetPrograms={(programs) => setPrograms(selected, programs)}
                    onSaveIdentity={(patch) => saveIdentity(selected, patch)}
                    onSetActive={(active) => void setServiceActive(selected.id, active)}
                />
            ) : services.length === 0 ? (
                <div>
                    <ConfigurationEmptyState
                        testId="financials-services-empty"
                        title="No services yet"
                        description="Services are the things your organization offers — full-time care, before & after care, drop-in, meals, registration. Start with the one most families enroll in."
                    />
                    {canMutate ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <ConfigurationPrimaryButton onClick={() => setMode({ kind: "author" })}>Add your first service</ConfigurationPrimaryButton>
                            <button type="button" className="config-secondary-btn" onClick={() => void seedStarters()} disabled={busy} data-testid="services-bos-seed">
                                💡 Most childcare orgs start with Full-Time Care, Before Care, After Care — add these as drafts?
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : (
                <ul className="space-y-1.5" data-testid="services-list">
                    {services.map((s) => {
                        const attention = hasAttention(s);
                        const glyph = s.isActive && !attention ? "●" : "○";
                        return (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    onClick={() => setMode({ kind: "operate", id: s.id })}
                                    data-testid={`service-row-${s.key}`}
                                    className="flex w-full items-center gap-3 rounded-xl border border-alloy-stone bg-white px-4 py-3 text-left transition-colors hover:border-[#00a283]/40"
                                >
                                    <span className={attention ? "text-alloy-ember" : s.isActive ? "text-[#00a283]" : "text-alloy-forge/30"}>{glyph}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="config-typo-queue-item-title block truncate">{s.label}{s.isActive ? "" : " · retired"}</span>
                                        {s.description ? <span className="config-typo-meta block truncate">{s.description}</span> : null}
                                    </span>
                                    <span className="shrink-0 rounded-full border border-alloy-stone px-2 py-0.5 config-typo-meta text-alloy-forge/70">
                                        {SERVICE_RHYTHM_LABEL[rhythmOf(s.serviceType)]}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
