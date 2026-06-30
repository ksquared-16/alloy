"use client";

import { useState } from "react";
import { ConfigurationDetailCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigField, ConfigFieldGrid } from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import {
    ConfigSecondaryButton,
    ConfigSelectInput,
    ConfigTextInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import type { FinancialService } from "@/lib/financials/services/financialServicesStore";
import type { ServiceValidationFinding } from "@/lib/financials/services/serviceValidation";
import { isPricedByRatePlans } from "@/lib/financials/services/serviceCapabilities";

/**
 * The relationship constellation (Alloy Services V1 blueprint §V1.2). Each card
 * is a read-through summary — the Service is the hub, authoring lives in the
 * other sections. Programs are editable here (stored on the service until a
 * program-catalog link exists); Pricing/Charges/Revenue are read-through with a
 * pointer to their authoring home.
 */
export default function ServiceRelationshipCards({
    service,
    ratePlanCount,
    priceRange,
    chargeCount,
    categoryLabel,
    revenueAccountLabel,
    categoryOptions,
    canMutate,
    busy,
    findingFor,
    onChangeCategory,
    onSetPrograms,
}: {
    service: FinancialService;
    ratePlanCount: number;
    priceRange: string | null;
    chargeCount: number;
    categoryLabel: string | null;
    revenueAccountLabel: string | null;
    categoryOptions: { value: string; label: string }[];
    canMutate: boolean;
    busy: boolean;
    findingFor: (target: ServiceValidationFinding["target"]) => ServiceValidationFinding | null;
    onChangeCategory: (category: string) => void;
    onSetPrograms: (programs: string[]) => void;
}) {
    const [newProgram, setNewProgram] = useState("");
    const pricedByPlans = isPricedByRatePlans(service.capabilities);
    const pricingFinding = findingFor("pricing");
    const revenueFinding = findingFor("revenue");

    return (
        <div className="space-y-3" data-testid="service-relationship-cards">
            {/* Programs — editable association */}
            <ConfigurationDetailCard title="Which programs deliver it?">
                {service.programs.length === 0 ? (
                    <p className="config-typo-sublabel text-alloy-forge/55">
                        No programs associated yet — this service isn&apos;t delivered through any program.
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {service.programs.map((p) => (
                            <span key={p} className="inline-flex items-center gap-1 rounded-full border border-alloy-stone bg-alloy-stone/30 px-2.5 py-0.5 config-typo-meta">
                                {p}
                                {canMutate ? (
                                    <button
                                        type="button"
                                        aria-label={`Remove ${p}`}
                                        className="text-alloy-forge/40 hover:text-alloy-ember"
                                        disabled={busy}
                                        onClick={() => onSetPrograms(service.programs.filter((x) => x !== p))}
                                    >
                                        ×
                                    </button>
                                ) : null}
                            </span>
                        ))}
                    </div>
                )}
                {canMutate ? (
                    <div className="mt-2 flex gap-2">
                        <ConfigTextInput value={newProgram} onChange={setNewProgram} placeholder="Associate a program…" disabled={busy} testId="service-add-program" />
                        <ConfigSecondaryButton
                            onClick={() => {
                                const v = newProgram.trim();
                                if (v && !service.programs.includes(v)) onSetPrograms([...service.programs, v]);
                                setNewProgram("");
                            }}
                            disabled={busy || !newProgram.trim()}
                            testId="service-add-program-btn"
                        >
                            Add
                        </ConfigSecondaryButton>
                    </div>
                ) : null}
            </ConfigurationDetailCard>

            {/* Pricing (Rate Plans) OR Charges, depending on the switchboard */}
            {pricedByPlans ? (
                <ConfigurationDetailCard title="How is it priced?" testId="service-pricing-card">
                    {ratePlanCount > 0 ? (
                        <ConfigFieldGrid>
                            <ConfigField label="Priced by" value={`${ratePlanCount} rate plan${ratePlanCount === 1 ? "" : "s"}`} />
                            <ConfigField label="Price range" value={priceRange ?? "—"} />
                        </ConfigFieldGrid>
                    ) : (
                        <p className="config-typo-sublabel text-alloy-ember" data-testid="service-pricing-attention">
                            {pricingFinding?.message ?? "No price yet."}
                        </p>
                    )}
                    <p className="config-typo-meta mt-2 text-[#00a283]">→ Open in Rate Plans</p>
                </ConfigurationDetailCard>
            ) : (
                <ConfigurationDetailCard title="What charges post here?" testId="service-charges-card">
                    <p className="config-typo-sublabel">
                        {chargeCount > 0 ? `${chargeCount} charge${chargeCount === 1 ? "" : "s"} post to this service.` : "No charges post to this service yet."}
                    </p>
                    <p className="config-typo-meta mt-2 text-[#00a283]">→ Open in Charges</p>
                </ConfigurationDetailCard>
            )}

            {/* Revenue home (read-through to Accounting) */}
            <ConfigurationDetailCard title="Where does its revenue land?" testId="service-revenue-card">
                {service.defaultChargeCategory && categoryLabel ? (
                    <ConfigField
                        label="Revenue home"
                        value={revenueAccountLabel ? `${categoryLabel} → ${revenueAccountLabel}` : `${categoryLabel} (account not mapped)`}
                    />
                ) : (
                    <p className="config-typo-sublabel text-alloy-ember" data-testid="service-revenue-attention">
                        {revenueFinding?.message ?? "This service's revenue has no home yet."}
                    </p>
                )}
                {canMutate ? (
                    <div className="mt-2">
                        <ConfigSelectInput
                            value={service.defaultChargeCategory ?? ""}
                            onChange={onChangeCategory}
                            options={[{ value: "", label: "— Choose a revenue category —" }, ...categoryOptions]}
                            disabled={busy}
                            testId="service-category-select"
                        />
                        <p className="config-typo-meta mt-1 text-[#00a283]">→ Change the account in Accounting</p>
                    </div>
                ) : null}
            </ConfigurationDetailCard>
        </div>
    );
}
