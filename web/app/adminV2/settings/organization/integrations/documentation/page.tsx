/**
 * Developer Documentation — the first screen.
 *
 * Written for a developer who has never seen Alloy and has about ninety seconds. It answers the
 * questions that decide whether they can start, and then gets out of the way and sends them into
 * the governed documents.
 *
 * WHAT IS CALLABLE IS NOT WRITTEN HERE. The operation list is read from the governed OpenAPI
 * document — the same file the drift guard enforces against the running routes — so this page
 * cannot advertise an endpoint that does not exist, and cannot fall behind one that does. That
 * matters more than it sounds: a documented endpoint that is not real is the most expensive error
 * an API programme can ship, and the scope vocabulary deliberately contains names (attendance.write)
 * that have no public endpoint behind them.
 */

import { ArrowRight, Building2, KeyRound, ListChecks, Map, Rocket, ScrollText } from "lucide-react";
import Link from "next/link";

import {
    AnswerCard,
    DocumentationShell,
} from "@/app/adminV2/settings/organization/integrations/documentation/DocumentationShell";
import {
    API_REFERENCE_PATH,
    DOCUMENTATION_BASE_PATH,
    DOCUMENTATION_SECTIONS,
    publicOperations,
} from "@/lib/developerDocs/documentationSources";

export const dynamic = "force-dynamic";

export default function DeveloperDocumentationLandingPage() {
    const operations = publicOperations();

    return (
        <DocumentationShell activeSlug={null}>
            <section data-testid="documentation-landing">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#007d68]">
                    Developer platform
                </p>
                <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-alloy-midnight">
                    Build against Alloy
                </h1>
                <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-alloy-midnight/75">
                    Alloy&rsquo;s Developer Platform lets approved external software read an
                    organization&rsquo;s data through a public HTTP API. An administrator installs your
                    application, grants it explicit capabilities and a location boundary, and issues it a
                    credential. Your code exchanges that credential for a token and calls the API — and
                    Alloy enforces the granted access on every request.
                </p>

                <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                    <AnswerCard icon={ListChecks} question="What can I use today?" testId="landing-current-surface">
                        {operations.length === 0 ?
                            <p>The governed API reference is not available in this build.</p>
                        :   <>
                                <ul className="space-y-1.5" data-testid="landing-operations">
                                    {operations.map((operation) => (
                                        <li key={`${operation.method} ${operation.path}`}>
                                            <code className="rounded border border-alloy-forge/10 bg-alloy-stone/70 px-1 py-px font-mono text-[11.5px] text-alloy-midnight">
                                                {operation.method} {operation.path}
                                            </code>
                                            <span className="mt-0.5 block text-[11.5px] text-alloy-midnight/60">
                                                {operation.summary}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="mt-2 text-[11.5px] text-alloy-midnight/55">
                                    {operations.length === 1 ?
                                        "This is the entire public API today."
                                    :   `These ${operations.length} operations are the entire public API today.`}{" "}
                                    Capability names you may see in the installation UI — attendance among
                                    them — describe access Alloy has defined, not endpoints it publishes.
                                    If an operation is not listed here, no credential can reach it.
                                </p>
                            </>
                        }
                    </AnswerCard>

                    <AnswerCard icon={KeyRound} question="How do I authenticate?" testId="landing-authentication">
                        <p>
                            The administrator issues you a client id and a client secret — the secret is
                            shown once, at issue. Exchange them at the token endpoint for a short-lived
                            bearer token and send it on every call.
                        </p>
                        {/*
                          * Into the partner-safe specification, not the internal doctrine document
                          * that used to sit behind this link. That document names security findings,
                          * threads and pull requests — accurate, internal, and not for a partner.
                          */}
                        <Link
                            href={`${DOCUMENTATION_BASE_PATH}/specification#3-authentication`}
                            className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#007d68] hover:underline"
                        >
                            Authentication, in full <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                    </AnswerCard>

                    <AnswerCard icon={Building2} question="Which organization am I accessing?" testId="landing-context">
                        <p>
                            The one your installation belongs to. There is no organization parameter to
                            choose and no way to ask for another: the credential determines it, and the
                            context endpoint tells you which organization, which capabilities and which
                            locations you actually hold.
                        </p>
                    </AnswerCard>

                    <AnswerCard icon={Map} question="What can I read right now?" testId="landing-resources">
                        <p>
                            Your own calling context, your organization&rsquo;s locations, and the
                            attendance facts recorded at the locations you are authorized for.
                            Attendance is append-only: corrections and reversals arrive as new facts
                            that name the one they supersede, so nothing you have read is ever
                            silently rewritten. Everything else in the documentation states a contract
                            Alloy has ratified but does not yet publish, and says so where it is
                            described.
                        </p>
                        <Link
                            href={`${DOCUMENTATION_BASE_PATH}/locations`}
                            className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#007d68] hover:underline"
                        >
                            Locations <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                    </AnswerCard>
                </div>

                {/*
                  * WHERE THE PLATFORM IS, SAID ONCE AND HONESTLY.
                  *
                  * The three operations are a first certified slice of a public API, not the whole
                  * of the Developer Platform — the trust machinery beneath them is real, complete
                  * and already carrying internal consumers. Describing the platform by the length
                  * of its endpoint list undersells what is built; describing the endpoint list as
                  * finished oversells what a partner can call. Both halves are stated, with no
                  * dates and no endpoint paths that do not exist.
                  */}
                <section className="mt-5" data-testid="landing-platform-position">
                    <h2 className="text-[13px] font-semibold tracking-tight text-alloy-midnight">
                        Where the platform is today
                    </h2>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <PositionCard
                            state="built"
                            title="Developer Platform foundation"
                            testId="position-foundation"
                            items={[
                                "Developer Applications, Installations and Credentials",
                                "Application Principals and tenant binding",
                                "External scopes and location/resource boundaries",
                                "API Activity, rate limiting and request correlation",
                                "A governed public contract enforced against the running routes",
                            ]}
                        >
                            Complete and in use. This is the part that decides who may call Alloy, on
                            whose behalf, and what they may reach.
                        </PositionCard>

                        <PositionCard
                            state="built"
                            title="Current public API"
                            testId="position-public-api"
                            items={operations.map((operation) => `${operation.method} ${operation.path}`)}
                        >
                            The first certified slice of external resources, callable today with a
                            credential.
                        </PositionCard>

                        <PositionCard
                            state="internal"
                            title="Internal consumers of the same authority"
                            testId="position-internal"
                            items={["Attendance submission runs on this authority model internally"]}
                        >
                            Some Alloy domains already use the Developer Platform&rsquo;s authority model
                            without a public endpoint. Attendance is one: you can read attendance facts,
                            and there is no public Attendance mutation — submitting a fact is not yet
                            something a credential can do, whatever the capability list suggests.
                        </PositionCard>

                        <PositionCard
                            state="next"
                            title="Public resource expansion"
                            testId="position-expansion"
                            items={[]}
                        >
                            Additional canonical Alloy domains will be externalized deliberately, as
                            stable platform contracts designed for external use — not by publishing
                            internal application routes. This documentation lists an operation only
                            once it is callable.
                        </PositionCard>
                    </div>
                </section>

                <div className="mt-5 rounded-xl border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.05] p-4" data-testid="landing-build-first">
                    <div className="flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-[#007d68]" aria-hidden />
                        <h2 className="text-[13px] font-semibold tracking-tight text-alloy-midnight">
                            What to build first
                        </h2>
                    </div>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-[1.7] text-alloy-midnight/80">
                        <li>Exchange your client id and secret for a token.</li>
                        <li>Call the context endpoint and log what it returns — that is your granted access, stated by Alloy rather than assumed by you.</li>
                        <li>Page through locations, and store the identifiers you get back.</li>
                        <li>Handle token expiry and the error envelope before you write anything else.</li>
                    </ol>
                    <Link
                        href={`${DOCUMENTATION_BASE_PATH}/getting-started`}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#007d68] px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-[#00694f]"
                        data-testid="landing-start-reading"
                    >
                        Start with Getting started <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                </div>

                <section className="mt-7" data-testid="landing-sections">
                    <h2 className="text-[13px] font-semibold tracking-tight text-alloy-midnight">
                        All documentation
                    </h2>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {DOCUMENTATION_SECTIONS.map((section) => (
                            <Link
                                key={section.slug}
                                href={`${DOCUMENTATION_BASE_PATH}/${section.slug}`}
                                data-testid={`landing-section-${section.slug}`}
                                className="group rounded-xl border border-alloy-forge/10 bg-white p-3 transition hover:border-alloy-bend-pine/35"
                            >
                                <span className="flex items-center justify-between gap-2">
                                    <span className="text-[12.5px] font-semibold text-alloy-midnight group-hover:text-[#007d68]">
                                        {section.title}
                                    </span>
                                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/25 group-hover:text-[#007d68]" aria-hidden />
                                </span>
                                <span className="mt-1 block text-[11.5px] leading-[1.6] text-alloy-midnight/60">
                                    {section.blurb}
                                </span>
                            </Link>
                        ))}
                        <Link
                            href={API_REFERENCE_PATH}
                            data-testid="landing-section-api-reference"
                            className="group rounded-xl border border-alloy-forge/10 bg-white p-3 transition hover:border-alloy-bend-pine/35"
                        >
                            <span className="flex items-center justify-between gap-2">
                                <span className="text-[12.5px] font-semibold text-alloy-midnight group-hover:text-[#007d68]">
                                    API Reference
                                </span>
                                <ScrollText className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/25 group-hover:text-[#007d68]" aria-hidden />
                            </span>
                            <span className="mt-1 block text-[11.5px] leading-[1.6] text-alloy-midnight/60">
                                Every operation, parameter and response, read from the governed OpenAPI
                                document. One specification — nothing restates it.
                            </span>
                        </Link>
                    </div>
                </section>
            </section>
        </DocumentationShell>
    );
}

/** One honest statement about a part of the platform, and what state that part is in. */
function PositionCard({
    state,
    title,
    items,
    children,
    testId,
}: {
    state: "built" | "internal" | "next";
    title: string;
    items: string[];
    children: React.ReactNode;
    testId: string;
}) {
    const tone =
        state === "built" ? "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.05] text-[#007d68]"
        : state === "internal" ? "border-alloy-blue/20 bg-alloy-blue/[0.05] text-alloy-blue"
        : "border-alloy-forge/12 bg-alloy-stone/60 text-alloy-midnight/55";
    const label = state === "built" ? "Implemented" : state === "internal" ? "Internal today" : "Next phase";

    return (
        <article
            className="rounded-xl border border-alloy-forge/10 bg-white p-3.5 shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
            data-testid={testId}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[12.5px] font-semibold tracking-tight text-alloy-midnight">{title}</h3>
                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
                    {label}
                </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-[1.6] text-alloy-midnight/70">{children}</p>
            {items.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[11.5px] leading-[1.55] text-alloy-midnight/62">
                    {items.map((item) => (
                        <li key={item} className="flex gap-1.5">
                            <span aria-hidden className="text-alloy-midnight/25">&middot;</span>
                            <span className="font-mono text-[11px]">{item}</span>
                        </li>
                    ))}
                </ul>
            )}
        </article>
    );
}
