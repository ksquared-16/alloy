import { ArrowLeft, BookOpen, FileJson, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
    API_REFERENCE_PATH,
    DOCUMENTATION_BASE_PATH,
    DOCUMENTATION_NAV,
    INTEGRATIONS_PATH,
} from "@/lib/developerDocs/documentationSources";

/**
 * The frame every documentation page shares.
 *
 * This opens in its own tab, so it cannot borrow context from wherever the reader came from: the
 * masthead says what this is, and the rail says what else there is to read. A developer who is sent
 * a deep link lands somewhere that explains itself.
 */
export function DocumentationShell({
    activeSlug,
    children,
    aside,
}: {
    activeSlug: string | null;
    children: ReactNode;
    /** Per-page companion column — a table of contents on a document page. */
    aside?: ReactNode;
}) {
    return (
        <div className="min-h-full bg-white" data-testid="developer-documentation">
            <header className="border-b border-alloy-stone/70 bg-alloy-stone/35">
                <div className="mx-auto flex max-w-[78rem] flex-wrap items-center justify-between gap-3 px-6 py-3.5">
                    <Link href={DOCUMENTATION_BASE_PATH} className="group flex items-center gap-2.5">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.10] text-[#007d68]">
                            <BookOpen className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[14px] font-semibold tracking-tight text-alloy-midnight group-hover:text-[#007d68]">
                                Alloy Developer Platform
                            </span>
                            <span className="block text-[11px] text-alloy-midnight/55">
                                Documentation for external software connecting to Alloy
                            </span>
                        </span>
                    </Link>
                    <span className="flex flex-wrap items-center gap-2">
                        {/*
                          * THE WAY BACK.
                          *
                          * This opens in its own tab from an Installation, so the browser's Back
                          * button leads nowhere useful — a new tab has no history. Without this an
                          * operator who followed the link had to close the tab to find the product
                          * again. It stays in THIS tab: the Installation tab is still open where
                          * they left it.
                          */}
                        <Link
                            href={INTEGRATIONS_PATH}
                            data-testid="documentation-back-to-integrations"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-alloy-midnight transition hover:border-alloy-bend-pine/40 hover:text-[#007d68]"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                            Back to Integrations
                        </Link>
                        <Link
                            href={API_REFERENCE_PATH}
                            data-testid="developer-documentation-api-reference"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-alloy-midnight transition hover:border-alloy-bend-pine/40 hover:text-[#007d68]"
                        >
                            <FileJson className="h-3.5 w-3.5" aria-hidden />
                            API Reference
                        </Link>
                    </span>
                </div>
            </header>

            <div className="mx-auto flex max-w-[78rem] flex-col gap-6 px-6 py-6 lg:flex-row">
                <nav
                    className="w-full shrink-0 lg:w-56"
                    aria-label="Documentation sections"
                    data-testid="developer-documentation-index"
                >
                    <p className="px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40">
                        Documentation
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                        {DOCUMENTATION_NAV.map((section) => {
                            const active = section.slug === activeSlug;
                            return (
                                <li key={section.slug}>
                                    <Link
                                        href={section.href}
                                        data-testid={`doc-nav-${section.slug}`}
                                        aria-current={active ? "page" : undefined}
                                        className={`block rounded-md px-2 py-1.5 text-[12.5px] leading-snug transition ${
                                            active ?
                                                "bg-alloy-bend-pine/[0.09] font-semibold text-[#007d68]"
                                            :   "text-alloy-midnight/75 hover:bg-alloy-stone/70 hover:text-alloy-midnight"
                                        }`}
                                    >
                                        {section.title}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <main className="min-w-0 flex-1">{children}</main>

                {aside ?
                    <aside className="hidden w-52 shrink-0 xl:block" data-testid="developer-documentation-toc">
                        <div className="sticky top-6">{aside}</div>
                    </aside>
                :   null}
            </div>
        </div>
    );
}

/** A small labelled fact — used by the landing to answer a question in one line. */
export function AnswerCard({
    icon: Icon,
    question,
    children,
    testId,
}: {
    icon: LucideIcon;
    question: string;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <article
            className="rounded-xl border border-alloy-forge/10 bg-white p-3.5 shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
            data-testid={testId}
        >
            <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-alloy-bend-pine/[0.09] text-[#007d68]">
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
                </span>
                <h3 className="text-[12.5px] font-semibold tracking-tight text-alloy-midnight">{question}</h3>
            </div>
            <div className="mt-2 text-[12.5px] leading-[1.65] text-alloy-midnight/75">{children}</div>
        </article>
    );
}
