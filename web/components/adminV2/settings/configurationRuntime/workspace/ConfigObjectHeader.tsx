"use client";

import type { ReactNode } from "react";

/**
 * Configuration Object Header — answers "What am I configuring?"
 * `hero` is the page anchor; `default` is a selected child object.
 */
export function ConfigObjectHeader({
    name,
    status,
    facts = [],
    breadcrumb,
    actions,
    testId = "config-object-header",
    size = "default",
}: {
    name: string;
    status?: { label: string; tone: "active" | "inactive" | "attention" };
    /** Only include facts that have real values — never "not set" placeholders. */
    facts?: string[];
    breadcrumb?: ReactNode;
    actions?: ReactNode;
    testId?: string;
    size?: "default" | "hero";
}) {
    const visibleFacts = facts.map((fact) => fact.trim()).filter(Boolean);
    const isHero = size === "hero";

    return (
        <header
            className={isHero ? undefined : "mb-1"}
            data-testid={testId}
            data-config-header-size={size}
        >
            {breadcrumb ?
                <div className="mb-2">{breadcrumb}</div>
            :   null}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1
                            className={
                                isHero ?
                                    "text-[1.75rem] font-semibold tracking-tight text-alloy-midnight sm:text-[2rem] leading-tight"
                                :   "text-xl font-semibold tracking-tight text-alloy-midnight sm:text-2xl"
                            }
                        >
                            {name}
                        </h1>
                        {status ?
                            <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                    status.tone === "inactive" ?
                                        "border-alloy-forge/15 bg-alloy-stone/15 text-alloy-midnight/55"
                                    : status.tone === "attention" ?
                                        "border-alloy-ember/25 bg-alloy-ember/[0.08] text-alloy-ember"
                                    :   "border-[#00a283]/25 bg-[#00a283]/10 text-[#007d68]"
                                }`}
                            >
                                {status.tone === "inactive" ? "○" : "●"} {status.label}
                            </span>
                        :   null}
                    </div>
                    {visibleFacts.length > 0 ?
                        <p
                            className={
                                isHero ?
                                    "mt-2 text-sm text-alloy-midnight/55"
                                :   "config-typo-sublabel mt-1"
                            }
                        >
                            {visibleFacts.join(" · ")}
                        </p>
                    :   null}
                </div>
                {actions ?
                    <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
                :   null}
            </div>
        </header>
    );
}
