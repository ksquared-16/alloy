"use client";

import { useMemo, useState } from "react";
import { ConfigField, ConfigFieldGrid } from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import {
    ConfigButtonRow,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
    ConfigTextInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import ServiceSwitchboard from "@/components/adminV2/settings/financials/services/ServiceSwitchboard";
import ServiceRelationshipCards from "@/components/adminV2/settings/financials/services/ServiceRelationshipCards";
import type { FinancialService } from "@/lib/financials/services/financialServicesStore";
import { FINANCIAL_SERVICE_TYPE_LABEL } from "@/lib/financials/services/financialServicesStore";
import { rhythmOf, SERVICE_RHYTHM_LABEL, type ServiceCapability } from "@/lib/financials/services/serviceCapabilities";
import { validateService, type ServiceValidationFinding } from "@/lib/financials/services/serviceValidation";

/**
 * OPERATE shape — the home/returning state (Alloy Services V1 blueprint §V1.2).
 * The connected switchboard canvas: identity + switchboard (left), relationship
 * constellation (right), with operational validation decorating the affected
 * cards. Summary mode by default; Activity is the honest change/audit view
 * (Services are a non-versioned catalog per the frozen Commercial Model — see
 * the V1 deviation note; there is no supersede timeline here).
 */
export default function ServiceOperateView({
    service,
    canMutate,
    busy,
    ratePlanCount,
    priceRange,
    chargeCount,
    categoryLabel,
    revenueAccountLabel,
    categoryOptions,
    onToggleCapability,
    onChangeCategory,
    onSetPrograms,
    onSaveIdentity,
    onSetActive,
}: {
    service: FinancialService;
    canMutate: boolean;
    busy: boolean;
    ratePlanCount: number;
    priceRange: string | null;
    chargeCount: number;
    categoryLabel: string | null;
    revenueAccountLabel: string | null;
    categoryOptions: { value: string; label: string }[];
    onToggleCapability: (cap: ServiceCapability, value: boolean) => void;
    onChangeCategory: (category: string) => void;
    onSetPrograms: (programs: string[]) => void;
    onSaveIdentity: (patch: { label: string; description: string | null; unit: string | null }) => void;
    onSetActive: (active: boolean) => void;
}) {
    const [view, setView] = useState<"summary" | "activity">("summary");
    const [editingIdentity, setEditingIdentity] = useState(false);
    const [label, setLabel] = useState(service.label);
    const [sentence, setSentence] = useState(service.description ?? "");
    const [unit, setUnit] = useState(service.unit ?? "");

    const findings = useMemo(
        () =>
            validateService({
                label: service.label,
                serviceType: service.serviceType,
                capabilities: service.capabilities,
                hasRatePlan: ratePlanCount > 0,
                hasRevenueHome: service.defaultChargeCategory != null,
            }),
        [service, ratePlanCount],
    );
    const findingFor = (target: ServiceValidationFinding["target"]) => findings.find((f) => f.target === target) ?? null;
    const switchboardFindings = findings.filter((f) => f.target === "switchboard");
    const rhythm = SERVICE_RHYTHM_LABEL[rhythmOf(service.serviceType)];

    return (
        <div data-testid="service-operate-view">
            <div className="mb-3 flex items-center gap-2">
                <button
                    type="button"
                    className={`config-typo-meta rounded-full px-2.5 py-1 ${view === "summary" ? "bg-[#00a283]/[0.08] text-[#00a283]" : "text-alloy-forge/55"}`}
                    onClick={() => setView("summary")}
                    data-testid="service-view-summary"
                >
                    Summary
                </button>
                <button
                    type="button"
                    className={`config-typo-meta rounded-full px-2.5 py-1 ${view === "activity" ? "bg-[#00a283]/[0.08] text-[#00a283]" : "text-alloy-forge/55"}`}
                    onClick={() => setView("activity")}
                    data-testid="service-view-activity"
                >
                    Activity
                </button>
            </div>

            {view === "activity" ? (
                <div data-testid="service-activity-view">
                    <p className="config-typo-queue-section-label mb-2">WHAT CHANGED?</p>
                    <ConfigFieldGrid>
                        <ConfigField label="Status" value={service.isActive ? "Active" : "Retired"} />
                        <ConfigField label="Added" value={service.createdAt ? service.createdAt.slice(0, 10) : "—"} />
                        <ConfigField label="Last updated" value={service.updatedAt ? service.updatedAt.slice(0, 10) : "—"} />
                    </ConfigFieldGrid>
                    <p className="config-typo-meta mt-3 text-alloy-forge/55">
                        The service catalog is a list, not a versioned timeline — rate amounts are the versioned objects
                        (in Rate Plans). This shows when this service was last changed.
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[44fr_56fr]">
                    {/* LEFT — identity + switchboard */}
                    <div>
                        {editingIdentity ? (
                            <div className="space-y-2" data-testid="service-identity-edit">
                                <ConfigTextInput value={label} onChange={setLabel} placeholder="Name" disabled={busy} testId="service-edit-name" />
                                <ConfigTextInput value={sentence} onChange={setSentence} placeholder="In one sentence" disabled={busy} testId="service-edit-sentence" />
                                <ConfigTextInput value={unit} onChange={setUnit} placeholder="How is this sold? e.g. week, day, trip" disabled={busy} testId="service-edit-unit" />
                                <ConfigButtonRow>
                                    <ConfigSecondaryButton onClick={() => { setEditingIdentity(false); setLabel(service.label); setSentence(service.description ?? ""); setUnit(service.unit ?? ""); }} disabled={busy}>Cancel</ConfigSecondaryButton>
                                    <ConfigPrimaryButton
                                        onClick={() => { onSaveIdentity({ label: label.trim(), description: sentence.trim() || null, unit: unit.trim() || null }); setEditingIdentity(false); }}
                                        disabled={busy || !label.trim()}
                                        testId="service-save-identity"
                                    >
                                        Save
                                    </ConfigPrimaryButton>
                                </ConfigButtonRow>
                            </div>
                        ) : (
                            <div className="mb-4">
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="config-typo-workspace-title">{service.label}</h3>
                                    <span className="shrink-0 rounded-full border border-[#00a283]/40 px-2 py-0.5 config-typo-meta text-[#00a283]">{rhythm}</span>
                                </div>
                                {service.description ? <p className="config-typo-sublabel">{service.description}</p> : null}
                                <p className="config-typo-meta mt-1">
                                    {service.unit ? `Sold per ${service.unit} · ` : ""}
                                    {service.isActive ? "● Active" : "Retired"} · {FINANCIAL_SERVICE_TYPE_LABEL[service.serviceType]}
                                </p>
                                {canMutate ? (
                                    <button type="button" className="config-typo-meta mt-1 text-[#00a283]" onClick={() => setEditingIdentity(true)} data-testid="service-edit-details">
                                        Edit details
                                    </button>
                                ) : null}
                            </div>
                        )}

                        <div className="border-t border-alloy-stone/40 pt-3">
                            <ServiceSwitchboard
                                capabilities={service.capabilities}
                                canMutate={canMutate}
                                busy={busy}
                                onToggle={onToggleCapability}
                            />
                            {switchboardFindings.length > 0 ? (
                                <div className="mt-2 space-y-1" data-testid="service-switchboard-findings">
                                    {switchboardFindings.map((f, i) => (
                                        <p key={i} className={`config-typo-meta ${f.severity === "attention" ? "text-alloy-ember" : "text-amber-700"}`}>{f.message}</p>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        {canMutate ? (
                            <div className="mt-4">
                                {service.isActive ? (
                                    <ConfigSecondaryButton onClick={() => onSetActive(false)} disabled={busy} testId="service-retire">Retire service</ConfigSecondaryButton>
                                ) : (
                                    <ConfigSecondaryButton onClick={() => onSetActive(true)} disabled={busy} testId="service-reactivate">Reactivate</ConfigSecondaryButton>
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* RIGHT — relationship constellation */}
                    <ServiceRelationshipCards
                        service={service}
                        ratePlanCount={ratePlanCount}
                        priceRange={priceRange}
                        chargeCount={chargeCount}
                        categoryLabel={categoryLabel}
                        revenueAccountLabel={revenueAccountLabel}
                        categoryOptions={categoryOptions}
                        canMutate={canMutate}
                        busy={busy}
                        findingFor={findingFor}
                        onChangeCategory={onChangeCategory}
                        onSetPrograms={onSetPrograms}
                    />
                </div>
            )}
        </div>
    );
}
