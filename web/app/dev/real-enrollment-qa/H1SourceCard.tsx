import type { H1Readiness } from "./readH1Readiness";

/**
 * H1's starting point: the real paperwork, and the one path that actually turns it into a Form.
 *
 * Deliberately not a button. Forms Studio's `Create form → Existing document — Import from Work` is
 * `disabled` in the product and `Existing packet` reads "Coming later", so a control here would be a
 * control the product does not have. The supported direction runs the other way — the document is
 * already a Processing source, Alloy derives a draft from it, and the operator reviews and promotes
 * that draft — so this names the case and sends the Director to it.
 */
export default function H1SourceCard({ readiness }: { readiness: H1Readiness }) {
    return (
        <section className="my-8 rounded-2xl border border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.04] p-5" data-qa-h1-source="true">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-bend-pine">
                H1 · start here
            </p>
            <h2 className="mt-1 text-[19px] font-semibold text-alloy-midnight">
                The 2026&ndash;2027 admissions paperwork
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-alloy-midnight/75">
                School of Enrichment, Inc. (Bend, Oregon). This is the paperwork the programme was
                characterised against &mdash; three documents, 30 pages, 182 fillable destinations &mdash; not a
                recreation, and not the Admissions Packet that is already published.
            </p>

            {readiness.ok ? (
                <>
                    <ul className="mt-4 space-y-1.5">
                        {readiness.sources.map((s, i) => (
                            <li key={`${s.title}-${i}`} className="text-[13px] text-alloy-midnight">
                                <span className="font-medium">{s.title}</span>
                                <span className="text-[11px] text-alloy-midnight/50">
                                    {s.docType ? ` · ${s.docType}` : ""}
                                    {s.role ? ` · ${s.role}` : ""}
                                    {s.status ? ` · ${s.status}` : ""}
                                </span>
                            </li>
                        ))}
                        {readiness.sources.length === 0 ? (
                            <li className="text-[13px] text-alloy-ember">
                                The case is here but no source document could be read back. Say so before starting H1.
                            </li>
                        ) : null}
                    </ul>
                    {readiness.unreadableSources > 0 ? (
                        <p className="mt-2 text-[12px] text-alloy-ember">
                            {readiness.unreadableSources} source reference(s) point at a document that could not be read.
                        </p>
                    ) : null}
                    <a
                        href={`/workspace/processing/${readiness.caseId}`}
                        target="_blank"
                        rel="noreferrer"
                        data-qa-open-h1-case="true"
                        className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white"
                    >
                        Open the paperwork in Processing
                    </a>
                    <p className="mt-2 text-[12px] text-alloy-midnight/60">
                        Case {readiness.caseId.slice(0, 8)} · {readiness.caseStatus ?? "status unknown"}
                        {readiness.caseType ? ` · ${readiness.caseType}` : ""}. If that link does not land where you
                        expect, navigate to Processing yourself and find the case &mdash; the route is a convenience,
                        not the thing being tested.
                    </p>
                </>
            ) : (
                <div className="mt-4 rounded-xl border border-alloy-ember/25 bg-alloy-ember/[0.06] px-4 py-3">
                    <p className="text-[13px] text-alloy-ember">{readiness.reason}</p>
                    {readiness.candidates?.length ? (
                        <>
                            <p className="mt-2 text-[13px] text-alloy-midnight/75">
                                Documents in THIS environment with matching titles &mdash; one of these may be the
                                paperwork, on a different case:
                            </p>
                            <ul className="mt-1.5 space-y-1">
                                {readiness.candidates.map((c) => (
                                    <li key={`${c.title}-${c.createdAt ?? ""}`} className="text-[13px] text-alloy-midnight">
                                        {c.title}
                                        <span className="text-[11px] text-alloy-midnight/50">
                                            {c.docType ? ` · ${c.docType}` : ""}
                                            {c.status ? ` · ${c.status}` : ""}
                                        </span>
                                        {c.caseId ? (
                                            <a
                                                href={`/workspace/processing/${c.caseId}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="ml-2 text-[11px] text-alloy-bend-pine underline"
                                            >
                                                on case {c.caseId.slice(0, 8)}
                                                {c.caseRole ? ` (${c.caseRole})` : ""}
                                            </a>
                                        ) : (
                                            <span className="ml-2 text-[11px] text-alloy-midnight/40">not a case source</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className="mt-2 text-[13px] text-alloy-midnight/75">
                            No document in this environment has a matching title either, so the paperwork itself
                            needs to be supplied before H1 can start.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
