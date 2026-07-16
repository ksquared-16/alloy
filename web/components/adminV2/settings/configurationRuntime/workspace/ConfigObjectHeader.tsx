"use client";

import type { ReactNode } from "react";

/**
 * Configuration Object Header — answers "What am I configuring?"
 * Identifying facts are only shown when present; missing identity surfaces via Attention / Readiness.
 */
export function ConfigObjectHeader({
    name,
    status,
    facts = [],
    breadcrumb,
    actions,
    testId = "config-object-header",
}: {
    name: string;
    status?: { label: string; tone: "active" | "inactive" };
    /** Only include facts that have real values — never "not set" placeholders. */
    facts?: string[];
    breadcrumb?: ReactNode;
    actions?: ReactNode;
    testId?: string;
}) {
    const visibleFacts = facts.map((fact) => fact.trim()).filter(Boolean);

    return (
        <header className="mb-3 border-b border-alloy-forge/10 pb-3" data-testid={testId}>
            {breadcrumb ?
                <div className="mb-1.5 text-[11px] text-alloy-midnight/45">{breadcrumb}</div>
            :   null}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight sm:text-2xl">
                            {name}
                        </h1>
                        {status ?
                            <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                    status.tone === "inactive" ?
                                        "border-alloy-forge/15 bg-alloy-stone/15 text-alloy-midnight/55"
                                    :   "border-[#00a283]/25 bg-[#00a283]/10 text-[#007d68]"
                                }`}
                            >
                                {status.tone === "inactive" ? "○" : "●"} {status.label}
                            </span>
                        :   null}
                    </div>
                    {visibleFacts.length > 0 ?
                        <p className="config-typo-sublabel mt-1">{visibleFacts.join(" · ")}</p>
                    :   null}
                </div>
                {actions ?
                    <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
                :   null}
            </div>
        </header>
    );
}
