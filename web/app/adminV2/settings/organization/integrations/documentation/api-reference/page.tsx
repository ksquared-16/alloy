/**
 * API Reference — rendered from the governed OpenAPI document.
 *
 * This route replaces a link that pointed straight at the raw JSON. The JSON is still the
 * specification and is still one click away; what changed is that a developer opening "API
 * Reference" now lands on something they can read.
 *
 * Every value on this page is read from the governed document. Nothing is restated here, so this
 * page cannot describe an operation Alloy does not serve — and when the next platform phase adds
 * resources, they appear here by being added to the specification, not by anyone writing a page.
 */

import { FileJson, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { DocumentationShell } from "@/app/adminV2/settings/organization/integrations/documentation/DocumentationShell";
import { CodeBlock } from "@/components/developerDocs/CodeBlock";
import { DocumentationRenderer } from "@/components/developerDocs/DocumentationRenderer";
import { parseBlocks } from "@/lib/developerDocs/markdown";
import { API_REFERENCE_SLUG, RAW_OPENAPI_PATH } from "@/lib/developerDocs/documentationSources";
import { apiReference, type ReferenceOperation } from "@/lib/developerDocs/openApiReference";

export const dynamic = "force-dynamic";

const METHOD_TONE: Record<string, string> = {
    GET: "border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.09] text-[#007d68]",
    POST: "border-alloy-blue/25 bg-alloy-blue/[0.07] text-alloy-blue",
};

export default function ApiReferencePage() {
    const reference = apiReference();

    return (
        <DocumentationShell
            activeSlug={API_REFERENCE_SLUG}
            aside={
                <nav aria-label="Operations">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40">
                        Operations
                    </p>
                    <ul className="mt-1.5 space-y-1 border-l border-alloy-stone/70">
                        {reference.operations.map((operation) => (
                            <li key={operation.id}>
                                <a
                                    href={`#${operation.id}`}
                                    className="block border-l-2 border-transparent py-0.5 pl-2.5 font-mono text-[11px] leading-snug text-alloy-midnight/60 transition hover:border-alloy-bend-pine/50 hover:text-[#007d68]"
                                >
                                    {operation.method} {operation.path.replace("/api/v1", "")}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            }
        >
            <article data-testid="api-reference">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#007d68]">
                    Developer platform
                </p>
                <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-alloy-midnight">API Reference</h1>
                <p className="mt-1.5 max-w-[46rem] text-[13px] leading-[1.7] text-alloy-midnight/70">
                    {reference.title} {reference.version}. Every operation below is read from Alloy&rsquo;s
                    governed OpenAPI document, which is enforced against the running routes — so this
                    page lists the public API exactly as it is, and nothing it does not serve.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                        href={RAW_OPENAPI_PATH}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="api-reference-raw-openapi"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-alloy-midnight transition hover:border-alloy-bend-pine/40 hover:text-[#007d68]"
                    >
                        <FileJson className="h-3.5 w-3.5" aria-hidden />
                        Download the OpenAPI document
                    </Link>
                    {reference.server && (
                        <span className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/60 px-2.5 py-1.5 font-mono text-[11.5px] text-alloy-midnight/70">
                            {reference.server}
                        </span>
                    )}
                </div>

                <div className="mt-6 max-w-[46rem] space-y-8">
                    {reference.operations.map((operation) => (
                        <Operation key={operation.id} operation={operation} />
                    ))}
                </div>
            </article>
        </DocumentationShell>
    );
}

function Operation({ operation }: { operation: ReferenceOperation }) {
    return (
        <section id={operation.id} className="scroll-mt-24" data-testid={`api-operation-${operation.id}`}>
            <div className="flex flex-wrap items-center gap-2">
                <span
                    className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                        METHOD_TONE[operation.method] ?? "border-alloy-forge/12 bg-alloy-stone/70 text-alloy-midnight/70"
                    }`}
                >
                    {operation.method}
                </span>
                <code className="font-mono text-[14px] font-semibold text-alloy-midnight">{operation.path}</code>
            </div>

            <p className="mt-1.5 text-[13.5px] font-medium text-alloy-midnight">{operation.summary}</p>
            {operation.description && (
                /*
                 * Operation descriptions are Markdown in the governed contract — the same source a
                 * partner downloads — so rendering them as plain text put literal `**` and raw
                 * bullet characters on the page. The emphasis in these descriptions is carrying
                 * the load-bearing sentences ("Enrollment is what makes a child visible"), which is
                 * exactly the text a reader skimming the reference must not lose.
                 *
                 * Reuses the guide parser and renderer rather than a second Markdown path, so the
                 * reference and the guides cannot render the same syntax two different ways.
                 */
                <div className="mt-1 text-[13px] leading-[1.7] text-alloy-midnight/75">
                    <DocumentationRenderer
                        blocks={parseBlocks(operation.description)}
                        sourceFile={RAW_OPENAPI_PATH}
                    />
                </div>
            )}

            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.4] px-3 py-2 text-[12px]">
                <div className="flex items-center gap-1.5">
                    <Lock className="h-3 w-3 text-alloy-midnight/35" aria-hidden />
                    <dt className="text-alloy-midnight/45">Authentication</dt>
                    <dd className="font-medium text-alloy-midnight/85">{operation.authentication}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-alloy-midnight/35" aria-hidden />
                    <dt className="text-alloy-midnight/45">Required scope</dt>
                    <dd className="font-mono text-[11.5px] font-medium text-alloy-midnight/85">
                        {operation.requiredScope ?? "none"}
                    </dd>
                </div>
            </dl>

            {operation.parameters.length > 0 && (
                <>
                    <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/70">
                        Parameters
                    </h3>
                    <div className="mt-1.5 overflow-x-auto rounded-lg border border-alloy-forge/10">
                        <table className="w-full border-collapse text-[12.5px]">
                            <thead className="bg-alloy-stone/60">
                                <tr>
                                    {["Name", "In", "Type", "Description"].map((h) => (
                                        <th key={h} className="border-b border-alloy-forge/10 px-2.5 py-1.5 text-left font-semibold text-alloy-midnight">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {operation.parameters.map((parameter) => (
                                    <tr key={`${parameter.location}-${parameter.name}`} className="border-b border-alloy-stone/60 last:border-0">
                                        <td className="px-2.5 py-1.5 align-top">
                                            <code className="font-mono text-[11.5px] font-semibold text-alloy-midnight">
                                                {parameter.name}
                                            </code>
                                            {parameter.required && (
                                                <span className="ml-1 text-[10px] font-semibold uppercase text-alloy-ember">required</span>
                                            )}
                                        </td>
                                        <td className="px-2.5 py-1.5 align-top text-alloy-midnight/60">{parameter.location}</td>
                                        <td className="px-2.5 py-1.5 align-top text-alloy-midnight/75">
                                            {parameter.type}
                                            {parameter.constraint && (
                                                <span className="block text-[11px] text-alloy-midnight/45">{parameter.constraint}</span>
                                            )}
                                        </td>
                                        <td className="px-2.5 py-1.5 align-top text-alloy-midnight/75">
                                            {parameter.description ?? "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {operation.requestBody?.example && (
                <>
                    <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/70">
                        Request body
                        {operation.requestBody.required && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase text-alloy-ember">required</span>
                        )}
                    </h3>
                    <CodeBlock code={operation.requestBody.example} lang="json" />
                </>
            )}

            <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/70">
                Example request
            </h3>
            <CodeBlock code={operation.curl} lang="bash" />

            {operation.successExample && (
                <>
                    <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/70">
                        Success response
                    </h3>
                    {/*
                      * Shapes, not data. Field names come from the governed schema; values are
                      * placeholders, because the reference cannot know your organization and
                      * inventing plausible identifiers is how a developer ends up debugging a
                      * response that never existed.
                      */}
                    <CodeBlock code={operation.successExample} lang="json" />
                </>
            )}

            <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/70">
                Responses
            </h3>
            <ul className="mt-1.5 space-y-1">
                {operation.responses.map((response) => (
                    <li key={response.status} className="flex flex-wrap items-baseline gap-2 text-[12.5px]">
                        <code
                            className={`rounded border px-1 py-px font-mono text-[11.5px] font-semibold ${
                                response.status.startsWith("2") ?
                                    "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] text-[#007d68]"
                                :   "border-alloy-ember/25 bg-alloy-ember/[0.06] text-alloy-ember"
                            }`}
                        >
                            {response.status}
                        </code>
                        <span className="text-alloy-midnight/75">{response.description}</span>
                        {response.schema && (
                            <span className="font-mono text-[11px] text-alloy-midnight/40">{response.schema}</span>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
