/**
 * One governed document, rendered.
 *
 * The slug resolves through a closed registry, so this route cannot be pointed at an arbitrary file
 * — internal planning documents under `docs/api/developer-platform/product/**` are unreachable from
 * here by construction rather than by a filter somebody has to remember to apply.
 */

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentationShell } from "@/app/adminV2/settings/organization/integrations/documentation/DocumentationShell";
import { DocumentationRenderer } from "@/components/developerDocs/DocumentationRenderer";
import {
    DOCUMENTATION_BASE_PATH,
    DOCUMENTATION_SECTIONS,
    loadDocument,
} from "@/lib/developerDocs/documentationSources";

/**
 * The published slugs are known at build time, and nothing else resolves.
 *
 * `dynamicParams = false` is what makes an unknown slug a real 404 rather than a 200 carrying an
 * apology. Deciding at render time could not: the layout has already streamed by then, the status
 * line is long gone, and Next can only swap the body. Enumerating the slugs moves the decision to
 * routing, where a status code can still be chosen — and it is possible at all because the governed
 * documents are embedded in the bundle rather than read from disk.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return DOCUMENTATION_SECTIONS.map((section) => ({ section: section.slug }));
}

export default async function DeveloperDocumentationSectionPage({
    params,
}: {
    params: Promise<{ section: string }>;
}) {
    const { section: slug } = await params;
    const loaded = loadDocument(slug);
    if (!loaded) notFound();

    const { section, document } = loaded;
    const index = DOCUMENTATION_SECTIONS.findIndex((s) => s.slug === section.slug);
    const previous = index > 0 ? DOCUMENTATION_SECTIONS[index - 1] : null;
    const next = index >= 0 && index < DOCUMENTATION_SECTIONS.length - 1 ? DOCUMENTATION_SECTIONS[index + 1] : null;

    return (
        <DocumentationShell
            activeSlug={section.slug}
            aside={
                document.outline.length > 1 ?
                    <nav aria-label="On this page">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40">
                            On this page
                        </p>
                        <ul className="mt-1.5 space-y-1 border-l border-alloy-stone/70">
                            {document.outline.map((entry) => (
                                <li key={entry.id}>
                                    <a
                                        href={`#${entry.id}`}
                                        className={`block border-l-2 border-transparent py-0.5 text-[11.5px] leading-snug text-alloy-midnight/60 transition hover:border-alloy-bend-pine/50 hover:text-[#007d68] ${
                                            entry.depth === 3 ? "pl-4" : "pl-2.5"
                                        }`}
                                    >
                                        {entry.text}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                :   null
            }
        >
            <article data-testid={`doc-section-${section.slug}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#007d68]">
                    Developer platform
                </p>
                <h1 className="mt-1 max-w-[46rem] text-[24px] font-semibold leading-tight tracking-tight text-alloy-midnight">
                    {document.title ?? section.title}
                </h1>
                <p className="mt-1.5 max-w-[46rem] text-[13px] text-alloy-midnight/60">{section.blurb}</p>

                <div className="mt-5 max-w-[46rem]">
                    <DocumentationRenderer blocks={document.blocks} sourceFile={section.file} />
                </div>

                <nav className="mt-10 flex flex-wrap items-stretch justify-between gap-2 border-t border-alloy-stone/70 pt-4">
                    {previous ?
                        <Link
                            href={`${DOCUMENTATION_BASE_PATH}/${previous.slug}`}
                            className="group flex min-w-[13rem] flex-1 items-center gap-2 rounded-lg border border-alloy-forge/10 px-3 py-2 transition hover:border-alloy-bend-pine/35"
                        >
                            <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/30 group-hover:text-[#007d68]" aria-hidden />
                            <span className="min-w-0">
                                <span className="block text-[10px] uppercase tracking-[0.1em] text-alloy-midnight/40">Previous</span>
                                <span className="block truncate text-[12.5px] font-semibold text-alloy-midnight group-hover:text-[#007d68]">
                                    {previous.title}
                                </span>
                            </span>
                        </Link>
                    :   <span className="flex-1" />}
                    {next ?
                        <Link
                            href={`${DOCUMENTATION_BASE_PATH}/${next.slug}`}
                            className="group flex min-w-[13rem] flex-1 items-center justify-end gap-2 rounded-lg border border-alloy-forge/10 px-3 py-2 text-right transition hover:border-alloy-bend-pine/35"
                        >
                            <span className="min-w-0">
                                <span className="block text-[10px] uppercase tracking-[0.1em] text-alloy-midnight/40">Next</span>
                                <span className="block truncate text-[12.5px] font-semibold text-alloy-midnight group-hover:text-[#007d68]">
                                    {next.title}
                                </span>
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/30 group-hover:text-[#007d68]" aria-hidden />
                        </Link>
                    :   <span className="flex-1" />}
                </nav>
            </article>
        </DocumentationShell>
    );
}
