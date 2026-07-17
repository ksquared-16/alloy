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
    factsContent,
    breadcrumb,
    actions,
    testId = "config-object-header",
    size = "default",
}: {
    name: string;
    status?: { label: string; tone: "active" | "inactive" | "attention" };
    /** Only include facts that have real values — never "not set" placeholders. */
    facts?: string[];
    /** Optional rich facts row (icons, etc.). When set, replaces the joined `facts` string. */
    factsContent?: ReactNode;
    breadcrumb?: ReactNode;
    actions?: ReactNode;
    testId?: string;
    size?: "default" | "hero";
}) {
    const visibleFacts = facts.map((fact) => fact.trim()).filter(Boolean);
    const isHero = size === "hero";
    const factsNode =
        factsContent ??
        (visibleFacts.length > 0 ?
            <p className="mt-1.5 text-[12px] leading-snug text-alloy-midnight/50">{visibleFacts.join(" · ")}</p>
        :   null);

    return (
        <header
            className={isHero ? undefined : "mb-3 border-b border-alloy-stone/20 pb-3"}
            data-testid={testId}
            data-config-header-size={size}
        >
            {breadcrumb ?
                <div className="mb-1.5" data-testid={`${testId}-breadcrumb`}>
                    {breadcrumb}
                </div>
            :   null}
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1
                            className={
                                isHero ?
                                    "text-[1.5rem] font-semibold tracking-tight text-alloy-midnight sm:text-[1.75rem] leading-none"
                                :   "text-2xl font-semibold tracking-tight text-alloy-midnight leading-none"
                            }
                        >
                            {name}
                        </h1>
                        {status ?
                            <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${
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
                    {factsNode}
                </div>
                {actions ?
                    <div className="flex shrink-0 flex-wrap items-center gap-2 pt-0.5">{actions}</div>
                :   null}
            </div>
        </header>
    );
}
