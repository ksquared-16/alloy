"use client";

import Link from "next/link";
import { organizationTuitionPlansHref } from "@/lib/commercial/commercialChapterRoutes";

export type TuitionSetupSection = "plans" | "commitments" | "frequencies";

const SETUP_TABS: { key: TuitionSetupSection; label: string }[] = [
    { key: "plans", label: "Plans" },
    { key: "commitments", label: "Enrollment Commitments" },
    { key: "frequencies", label: "Billing Frequencies" },
];

export function normalizeTuitionSetupSection(value: string | null | undefined): TuitionSetupSection {
    const normalized = value?.trim().toLowerCase();
    if (normalized === "commitments" || normalized === "frequencies") return normalized;
    return "plans";
}

export function TuitionSetupSubnav({
    active,
    planId,
    tab,
    onNewPlan,
}: {
    active: TuitionSetupSection;
    planId?: string | null;
    tab?: string | null;
    onNewPlan?: () => void;
}) {
    return (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-alloy-stone/20">
            <nav
                className="flex flex-wrap gap-1"
                aria-label="Tuition setup sections"
                data-testid="tuition-setup-subnav"
            >
                {SETUP_TABS.map((item) => {
                    const selected = item.key === active;
                    return (
                        <Link
                            key={item.key}
                            href={organizationTuitionPlansHref({
                                setup: item.key,
                                planId: item.key === "plans" ? planId : null,
                                tab: item.key === "plans" ? tab : null,
                            })}
                            scroll={false}
                            className={`px-3 py-1.5 text-[12px] -mb-px border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35 rounded-sm ${
                                selected
                                    ? "border-alloy-bend-pine text-alloy-bend-pine font-semibold"
                                    : "border-transparent text-alloy-midnight/55 hover:text-alloy-midnight"
                            }`}
                            data-testid={`tuition-setup-${item.key}`}
                            aria-current={selected ? "page" : undefined}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
            {active === "plans" && onNewPlan ?
                <button
                    type="button"
                    onClick={onNewPlan}
                    className="mb-1 inline-flex items-center gap-1 rounded-md bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                    data-testid="tuition-plans-new-plan"
                >
                    + New Tuition Plan
                </button>
            :   null}
        </div>
    );
}
