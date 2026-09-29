import { parseInline, type QaBlock, type QaInline } from "@/lib/qa/parseQaWalkthrough";

/**
 * A reader for one QA script.
 *
 * The operator runs this beside the product with the workspace in the other tab, so the job is
 * scanning, not reading prose: what to DO, what to EXPECT, and when to STOP have to be findable at a
 * glance while their eyes are mostly on Alloy. Everything else stays quiet.
 */

function Inline({ parts }: { parts: QaInline[] }) {
    return (
        <>
            {parts.map((p, i) => {
                if (p.kind === "strong") return <strong key={i} className="font-semibold text-alloy-midnight">{p.text}</strong>;
                if (p.kind === "em") return <em key={i}>{p.text}</em>;
                if (p.kind === "code")
                    return (
                        <code key={i} className="rounded bg-alloy-midnight/[0.06] px-1.5 py-0.5 font-mono text-[13px]">
                            {p.text}
                        </code>
                    );
                return <span key={i}>{p.text}</span>;
            })}
        </>
    );
}

export default function QaWalkthroughReader({ blocks }: { blocks: QaBlock[] }) {
    return (
        <main className="min-h-screen bg-white">
            {/* Kelly keeps this tab open beside Alloy, so the way back is always on screen. */}
            <header className="sticky top-0 z-10 border-b border-alloy-midnight/10 bg-white/95 backdrop-blur">
                <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-6 py-3">
                    <span className="text-[13px] font-semibold text-alloy-midnight">Real Enrollment QA</span>
                    <span className="rounded-full bg-alloy-ember/10 px-2 py-0.5 text-[11px] font-medium text-alloy-ember">
                        QA build · not a customer page
                    </span>
                    <div className="ml-auto flex items-center gap-3">
                        <a
                            href="/workspace"
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-[13px] font-medium text-white"
                        >
                            Open Alloy Workspace
                        </a>
                        <a href="#top" className="text-[13px] text-alloy-midnight/55 underline underline-offset-2">
                            Back to top
                        </a>
                    </div>
                </div>
            </header>

            <div id="top" className="mx-auto max-w-3xl px-6 pb-24 pt-6">
                {blocks.map((b, i) => {
                    switch (b.kind) {
                        case "heading": {
                            if (b.level === 1)
                                return (
                                    <h1
                                        key={i}
                                        id={b.slug}
                                        className="mt-10 scroll-mt-20 border-b border-alloy-midnight/10 pb-2 text-[22px] font-semibold text-alloy-midnight first:mt-0"
                                    >
                                        {b.text}
                                    </h1>
                                );
                            if (b.level === 2)
                                return (
                                    <h2 key={i} id={b.slug} className="mt-8 scroll-mt-20 text-[17px] font-semibold text-alloy-midnight">
                                        {b.text}
                                    </h2>
                                );
                            return (
                                <h3 key={i} id={b.slug} className="mt-6 scroll-mt-20 text-[15px] font-semibold text-alloy-midnight">
                                    {b.text}
                                </h3>
                            );
                        }
                        case "step": {
                            const isDo = b.verb === "DO";
                            return (
                                <div key={i} className="mt-4 flex gap-3" data-qa-step={b.label}>
                                    <span className="mt-0.5 w-9 shrink-0 rounded-md bg-alloy-midnight/[0.06] px-1.5 py-0.5 text-center text-[12px] font-semibold text-alloy-midnight">
                                        {b.label}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <span
                                            className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                                                isDo ? "bg-alloy-juniper/15 text-alloy-bend-pine" : "bg-alloy-midnight/[0.06] text-alloy-midnight/70"
                                            }`}
                                        >
                                            {b.verb}
                                        </span>
                                        <span className="text-[14px] leading-relaxed text-alloy-midnight/85">
                                            <Inline parts={b.body} />
                                        </span>
                                    </div>
                                </div>
                            );
                        }
                        case "expect":
                            return (
                                <div key={i} className="mt-1.5 flex gap-3" data-qa-expect="true">
                                    <span className="w-9 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <span className="mr-2 rounded bg-alloy-midnight/[0.06] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/70">
                                            Expect
                                        </span>
                                        <span className="text-[14px] leading-relaxed text-alloy-midnight/85">
                                            <Inline parts={b.body} />
                                        </span>
                                    </div>
                                </div>
                            );
                        case "note":
                            return (
                                <div
                                    key={i}
                                    data-qa-stop={b.stop ? "true" : undefined}
                                    className={`mt-4 rounded-xl border-l-4 px-4 py-3 ${
                                        b.stop
                                            ? "border-alloy-ember bg-alloy-ember/[0.06]"
                                            : "border-alloy-midnight/20 bg-alloy-midnight/[0.03]"
                                    }`}
                                >
                                    {b.lines.map((ln, k) => (
                                        <p
                                            key={k}
                                            className={`text-[13.5px] leading-relaxed ${k ? "mt-2" : ""} ${
                                                b.stop ? "text-alloy-ember" : "text-alloy-midnight/75"
                                            }`}
                                        >
                                            <Inline parts={ln} />
                                        </p>
                                    ))}
                                </div>
                            );
                        case "list": {
                            const cls = "mt-3 ml-5 space-y-1 text-[14px] leading-relaxed text-alloy-midnight/85";
                            const items = b.items.map((it, k) => (
                                <li key={k}>
                                    <Inline parts={it} />
                                </li>
                            ));
                            return b.ordered ? (
                                <ol key={i} className={`${cls} list-decimal`}>{items}</ol>
                            ) : (
                                <ul key={i} className={`${cls} list-disc`}>{items}</ul>
                            );
                        }
                        case "table":
                            return (
                                <div key={i} className="mt-4 overflow-x-auto">
                                    <table className="w-full border-collapse text-[13.5px]">
                                        <thead>
                                            <tr>
                                                {b.head.map((h, k) => (
                                                    <th
                                                        key={k}
                                                        className="border-b border-alloy-midnight/15 px-2 py-1.5 text-left font-semibold text-alloy-midnight"
                                                    >
                                                        <Inline parts={parseInline(h)} />
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {b.rows.map((r, k) => (
                                                <tr key={k}>
                                                    {r.map((c, n) => (
                                                        <td
                                                            key={n}
                                                            className="border-b border-alloy-midnight/[0.07] px-2 py-1.5 align-top text-alloy-midnight/80"
                                                        >
                                                            <Inline parts={parseInline(c)} />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        case "rule":
                            return <hr key={i} className="mt-8 border-alloy-midnight/10" />;
                        default:
                            return (
                                <p key={i} className="mt-3 text-[14px] leading-relaxed text-alloy-midnight/85">
                                    <Inline parts={b.body} />
                                </p>
                            );
                    }
                })}
            </div>
        </main>
    );
}
