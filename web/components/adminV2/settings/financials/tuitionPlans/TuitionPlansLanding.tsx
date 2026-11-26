"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import {
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { organizationFinancialsChapterHref, organizationTuitionPlansHref } from "@/lib/commercial/commercialChapterRoutes";
import type { TuitionPlanCollectionRow, TuitionSetupReadinessVm } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";

function TuitionSetupSequence({
    readiness,
    onCreatePlan,
}: {
    readiness: TuitionSetupReadinessVm;
    onCreatePlan: () => void;
}) {
    const steps = [
        readiness.glCodes,
        readiness.billingFrequencies,
        readiness.enrollmentCommitments,
        readiness.tuitionPlans,
    ];

    return (
        <section
            className="process-config-setup-card p-5"
            data-testid="tuition-plans-setup-sequence"
        >
            <h3 className="text-sm font-semibold text-alloy-midnight">Get started with Tuition Plans</h3>
            <p className="mt-1 text-sm text-alloy-midnight/55">
                Complete these steps to set up organization pricing.
            </p>
            <ol className="mt-4 space-y-3">
                {steps.map((step, index) => (
                    <li
                        key={step.actionLabel}
                        className="flex items-start gap-3"
                        data-testid={`tuition-setup-step-${index}`}
                    >
                        <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                                step.ok
                                    ? "bg-alloy-bend-pine/15 text-alloy-bend-pine"
                                    : "bg-alloy-stone/30 text-alloy-midnight/55"
                            }`}
                            aria-hidden
                        >
                            {step.ok ? "✓" : index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-alloy-midnight">{step.actionLabel}</p>
                            {!step.ok && "href" in step && step.href ?
                                <Link
                                    href={step.href}
                                    className="mt-0.5 inline-flex text-sm font-medium text-alloy-bend-pine hover:underline"
                                >
                                    Set up →
                                </Link>
                            : !step.ok && step.actionLabel === "Create Tuition Plan" ?
                                <button
                                    type="button"
                                    className="mt-0.5 text-sm font-medium text-alloy-bend-pine hover:underline"
                                    onClick={onCreatePlan}
                                >
                                    Create →
                                </button>
                            : step.ok ?
                                <p className="mt-0.5 text-sm text-alloy-midnight/45">Complete</p>
                            :   null}
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
}

export function TuitionPlansLanding({
    plans,
    readiness,
    onCreatePlan,
    canManage,
}: {
    plans: TuitionPlanCollectionRow[];
    readiness: TuitionSetupReadinessVm;
    onCreatePlan: () => void;
    canManage: boolean;
}) {
    const activeCount = plans.filter((row) => row.status !== "archived").length;
    const withGl = plans.filter((row) => row.hasRevenueGl).length;
    const needsGlCount = Math.max(0, activeCount - withGl);

    const setupLinks = [
        { label: "GL Codes", href: organizationFinancialsChapterHref("accounting") },
        { label: "Billing Frequencies", href: organizationTuitionPlansHref({ setup: "frequencies" }) },
        { label: "Enrollment Commitments", href: organizationTuitionPlansHref({ setup: "commitments" }) },
    ];

    return (
        <div className="flex w-full flex-col gap-3" data-testid="tuition-plans-landing">
            <section
                className="process-config-setup-card p-5"
                data-testid="tuition-plans-landing-header"
            >
                <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">Tuition Plans</h2>
                <p className="mt-1.5 max-w-2xl text-sm text-alloy-midnight/55">
                    {plans.length === 0
                        ? "Create a Tuition Plan to set organization pricing for a Program."
                        : "Select a Tuition Plan from the list, or create a new one."}
                </p>
                {canManage ?
                    <ConfigurationPrimaryButton
                        className="mt-4 gap-1"
                        onClick={onCreatePlan}
                        data-testid="tuition-plans-landing-create"
                    >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                        New Tuition Plan
                    </ConfigurationPrimaryButton>
                :   null}
            </section>

            {readiness.showGuide ?
                <TuitionSetupSequence readiness={readiness} onCreatePlan={onCreatePlan} />
            :   <p
                    className="text-sm text-alloy-midnight/50"
                    data-testid="tuition-plans-setup-complete"
                >
                    Financial Setup · foundations configured
                </p>
            }

            <section className="process-config-setup-card p-5" data-testid="tuition-plans-setup-links">
                <h3 className="text-sm font-semibold text-alloy-midnight">Financial setup</h3>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {setupLinks.map((link) => (
                        <li key={link.label}>
                            <Link href={link.href} className="font-medium text-alloy-bend-pine hover:underline">
                                {link.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>

            {needsGlCount > 0 ?
                <section
                    className="process-config-setup-card border-alloy-forge/15 bg-alloy-forge/[0.04] p-4"
                    data-testid="tuition-plans-attention-gl"
                >
                    <p className="text-sm text-alloy-midnight/75">
                        <span className="font-semibold text-alloy-midnight">{needsGlCount}</span>{" "}
                        Tuition Plan{needsGlCount === 1 ? "" : "s"} need accounting assignments.
                    </p>
                    <Link
                        href={organizationFinancialsChapterHref("accounting")}
                        className="mt-1 inline-flex text-sm font-medium text-alloy-bend-pine hover:underline"
                    >
                        Review GL Codes →
                    </Link>
                </section>
            :   null}
        </div>
    );
}
