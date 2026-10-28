"use client";

import { useEffect, useMemo, useState } from "react";

import { parseInline, type QaBlock, type QaInline } from "@/lib/qa/parseQaWalkthrough";

import { Inline } from "../real-enrollment-qa/QaWalkthroughReader";

/**
 * The Tours Human QA guide, with a results checklist beside every test.
 *
 * A test is a labelled step (`**A1. DO**`) and the EXPECT lines under it. Each gets one status —
 * PASS, FAIL, BLOCKED or NOT RUN — plus a note and an evidence reference (a screenshot file name or
 * link). Results are kept in this browser (`localStorage`), keyed by test label, and survive reloads;
 * the export names the guide version they were recorded against. Nothing is sent anywhere: this is a
 * results sheet, not a QA platform.
 */

export type QaStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT RUN";
const STATUSES: QaStatus[] = ["PASS", "FAIL", "BLOCKED", "NOT RUN"];
type Result = { status: QaStatus; note: string; evidence: string };
type Results = Record<string, Result>;
const EMPTY_RESULT: Result = { status: "NOT RUN", note: "", evidence: "" };

const STORAGE_KEY = "alloy.tours-human-qa-v2.results";
const TESTER_KEY = "alloy.tours-human-qa-v2.tester";

const STATUS_STYLE: Record<QaStatus, string> = {
    PASS: "border-emerald-600 bg-emerald-600 text-white",
    FAIL: "border-rose-600 bg-rose-600 text-white",
    BLOCKED: "border-amber-500 bg-amber-500 text-white",
    "NOT RUN": "border-alloy-midnight/40 bg-alloy-midnight/70 text-white",
};

const plain = (parts: QaInline[]) => parts.map((p) => p.text).join("");

type TestCase = { label: string; title: string; section: string };

/** The tests in document order, and which block closes each (its last EXPECT). */
function indexTests(blocks: QaBlock[]): { tests: TestCase[]; closesAt: Map<number, string> } {
    const tests: TestCase[] = [];
    const closesAt = new Map<number, string>();
    let section = "";
    let open: { label: string; at: number } | null = null;
    const close = () => {
        if (open) closesAt.set(open.at, open.label);
        open = null;
    };
    blocks.forEach((b, i) => {
        if (b.kind === "heading" && b.level <= 2) {
            close();
            section = b.text;
            return;
        }
        if (b.kind === "step") {
            if (!open || open.label !== b.label) {
                close();
                if (!tests.some((t) => t.label === b.label)) {
                    const title = plain(b.body);
                    tests.push({ label: b.label, title: title.length > 110 ? `${title.slice(0, 107)}…` : title, section });
                }
            }
            open = { label: b.label, at: i };
            return;
        }
        if (b.kind === "expect" && open) {
            open = { label: open.label, at: i };
            return;
        }
        close();
    });
    close();
    return { tests, closesAt };
}

function exportMarkdown(input: {
    tests: TestCase[];
    results: Results;
    tester: string;
    guideVersion: string;
    sourcePath: string;
}): string {
    const { tests, results } = input;
    const status = (l: string) => results[l]?.status ?? "NOT RUN";
    const count = (s: QaStatus) => tests.filter((t) => status(t.label) === s).length;
    const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
    const lines = [
        "# Tours, Public Forms & Communications — Human QA V2 results",
        "",
        `- Guide: \`${input.sourcePath}\` · version \`${input.guideVersion}\``,
        `- Tester: ${input.tester || "(not set)"}`,
        `- Exported: ${new Date().toISOString()}`,
        `- Where: ${typeof window !== "undefined" ? window.location.origin : ""}`,
        `- Summary: ${STATUSES.map((s) => `${s} ${count(s)}`).join(" · ")} (of ${tests.length})`,
        "",
        "| Test | Status | Section | What | Note | Evidence |",
        "|---|---|---|---|---|---|",
        ...tests.map((t) => {
            const r = results[t.label];
            return `| ${t.label} | ${status(t.label)} | ${cell(t.section)} | ${cell(t.title)} | ${cell(r?.note ?? "")} | ${cell(r?.evidence ?? "")} |`;
        }),
        "",
        "## Failures and blocked tests",
        "",
        ...(tests.filter((t) => status(t.label) === "FAIL" || status(t.label) === "BLOCKED").map(
            (t) => `- **${t.label} ${status(t.label)}** — ${t.title}${results[t.label]?.note ? ` — ${results[t.label]!.note}` : ""}`,
        ) || []),
    ];
    if (!tests.some((t) => status(t.label) === "FAIL" || status(t.label) === "BLOCKED")) lines.push("- None.");
    return lines.join("\n") + "\n";
}

export default function ToursQaWorkbook({
    blocks,
    guideVersion,
    sourcePath,
}: {
    blocks: QaBlock[];
    guideVersion: string;
    sourcePath: string;
}) {
    const { tests, closesAt } = useMemo(() => indexTests(blocks), [blocks]);
    const sections = useMemo(() => blocks.filter((b): b is Extract<QaBlock, { kind: "heading" }> => b.kind === "heading" && b.level === 2), [blocks]);
    const [results, setResults] = useState<Results>({});
    const [tester, setTester] = useState("");
    const [loaded, setLoaded] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) setResults(JSON.parse(raw) as Results);
            setTester(window.localStorage.getItem(TESTER_KEY) ?? "");
        } catch {
            /* a corrupt or blocked store starts empty */
        }
        setLoaded(true);
    }, []);
    useEffect(() => {
        if (!loaded) return;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
            window.localStorage.setItem(TESTER_KEY, tester);
        } catch {
            /* storage full or blocked — the page still works for this visit */
        }
    }, [results, tester, loaded]);

    const update = (label: string, patch: Partial<Result>) =>
        setResults((prev) => ({ ...prev, [label]: { ...EMPTY_RESULT, ...prev[label], ...patch } }));
    const statusOf = (label: string): QaStatus => results[label]?.status ?? "NOT RUN";
    const counts = Object.fromEntries(STATUSES.map((s) => [s, tests.filter((t) => statusOf(t.label) === s).length])) as Record<QaStatus, number>;
    const problems = tests.filter((t) => statusOf(t.label) === "FAIL" || statusOf(t.label) === "BLOCKED");

    const report = () => exportMarkdown({ tests, results, tester, guideVersion, sourcePath });
    const download = () => {
        const blob = new Blob([report()], { type: "text/markdown;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `tours-human-qa-v2-results-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
    };
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(report());
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            download();
        }
    };

    return (
        <div className="min-h-screen bg-[#fbfaf7] text-alloy-midnight" data-testid="tours-qa-workbook">
            <header className="sticky top-0 z-10 border-b border-alloy-midnight/10 bg-white/95 backdrop-blur">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-alloy-bend-pine">Tours · Forms · Communications — Human QA</p>
                    <p className="text-[12px] text-alloy-midnight/60" data-testid="tours-qa-summary">
                        {STATUSES.map((s) => (
                            <span key={s} className="mr-3">
                                <strong>{counts[s]}</strong> {s}
                            </span>
                        ))}
                        <span className="text-alloy-midnight/40">of {tests.length} tests</span>
                    </p>
                    <div className="ml-auto flex gap-2">
                        <button type="button" onClick={copy} className="rounded-md border border-alloy-midnight/20 px-2.5 py-1 text-[12px] font-medium" data-testid="tours-qa-copy">
                            {copied ? "Copied" : "Copy results"}
                        </button>
                        <button type="button" onClick={download} className="rounded-md border border-alloy-bend-pine bg-alloy-bend-pine px-2.5 py-1 text-[12px] font-medium text-white" data-testid="tours-qa-download">
                            Download results
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 pb-28 pt-6 lg:grid-cols-[200px_1fr]">
                <nav className="lg:sticky lg:top-20 lg:self-start" aria-label="Sections" data-testid="tours-qa-nav">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Sections</p>
                    <ol className="space-y-1 text-[13px]">
                        {sections.map((s) => (
                            <li key={s.slug}>
                                <a href={`#${s.slug}`} className="text-alloy-midnight/75 hover:text-alloy-bend-pine">
                                    {s.text}
                                </a>
                            </li>
                        ))}
                    </ol>
                    <div className="mt-6 space-y-2 text-[12px]">
                        <label className="block text-alloy-midnight/60">
                            Tester
                            <input
                                value={tester}
                                onChange={(e) => setTester(e.target.value)}
                                className="mt-1 w-full rounded border border-alloy-midnight/20 px-2 py-1"
                                placeholder="Your name"
                            />
                        </label>
                        <p className="text-alloy-midnight/45">Guide version {guideVersion}. Results stay in this browser.</p>
                        <button
                            type="button"
                            className="text-rose-600 hover:underline"
                            onClick={() => {
                                if (window.confirm("Clear every recorded result in this browser?")) setResults({});
                            }}
                        >
                            Clear results
                        </button>
                    </div>
                </nav>

                <main className="min-w-0 text-[14px] leading-relaxed">
                    {problems.length ? (
                        <section className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4" data-testid="tours-qa-problems">
                            <p className="text-[13px] font-semibold text-rose-700">Failing or blocked ({problems.length})</p>
                            <ul className="mt-1 list-disc pl-5 text-[13px] text-rose-800">
                                {problems.map((t) => (
                                    <li key={t.label}>
                                        <a href={`#test-${t.label}`} className="underline">
                                            {t.label}
                                        </a>{" "}
                                        {statusOf(t.label)} — {t.title}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {blocks.map((b, i) => {
                        const closing = closesAt.get(i);
                        const content = renderBlock(b, i);
                        if (!closing) return content;
                        const r = results[closing];
                        return (
                            <div key={i}>
                                {content}
                                <div
                                    className="mb-5 mt-2 rounded-lg border border-alloy-midnight/10 bg-white p-3"
                                    data-testid={`tours-qa-result-${closing}`}
                                >
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="mr-1 text-[12px] font-semibold text-alloy-midnight/60">{closing} result</span>
                                        {STATUSES.map((s) => (
                                            <button
                                                key={s}
                                                type="button"
                                                aria-pressed={statusOf(closing) === s}
                                                onClick={() => update(closing, { status: s })}
                                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                                    statusOf(closing) === s ? STATUS_STYLE[s] : "border-alloy-midnight/20 text-alloy-midnight/60"
                                                }`}
                                                data-testid={`tours-qa-${closing}-${s.replace(" ", "-").toLowerCase()}`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        <textarea
                                            value={r?.note ?? ""}
                                            onChange={(e) => update(closing, { note: e.target.value })}
                                            rows={2}
                                            placeholder="Notes — what you saw"
                                            className="rounded border border-alloy-midnight/15 px-2 py-1 text-[12px]"
                                        />
                                        <input
                                            value={r?.evidence ?? ""}
                                            onChange={(e) => update(closing, { evidence: e.target.value })}
                                            placeholder="Evidence — screenshot file name or link"
                                            className="rounded border border-alloy-midnight/15 px-2 py-1 text-[12px]"
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </main>
            </div>
        </div>
    );
}

function renderBlock(b: QaBlock, i: number) {
    switch (b.kind) {
        case "heading":
            if (b.level === 1)
                return (
                    <h1 key={i} id={b.slug} className="mb-3 scroll-mt-24 text-[24px] font-semibold">
                        {b.text}
                    </h1>
                );
            if (b.level === 2)
                return (
                    <h2 key={i} id={b.slug} className="mt-10 scroll-mt-24 border-b border-alloy-midnight/10 pb-1 text-[19px] font-semibold">
                        {b.text}
                    </h2>
                );
            return (
                <h3 key={i} id={b.slug} className="mt-6 scroll-mt-24 text-[15px] font-semibold">
                    {b.text}
                </h3>
            );
        case "step":
            return (
                <div key={i} id={`test-${b.label}`} className="mt-4 scroll-mt-24 rounded-lg border-l-4 border-alloy-bend-pine/60 bg-white px-3 py-2">
                    <span className="mr-2 font-mono text-[12px] font-semibold text-alloy-bend-pine">
                        {b.label} {b.verb}
                    </span>
                    <Inline parts={b.body} />
                </div>
            );
        case "expect":
            return (
                <div key={i} className="ml-4 mt-1 rounded-lg border-l-4 border-emerald-500/60 bg-emerald-50/60 px-3 py-2">
                    <span className="mr-2 font-mono text-[12px] font-semibold text-emerald-700">PASS if</span>
                    <Inline parts={b.body} />
                </div>
            );
        case "note":
            return (
                <div
                    key={i}
                    className={`my-3 rounded-lg border px-3 py-2 text-[13px] ${b.stop ? "border-rose-300 bg-rose-50" : "border-amber-200 bg-amber-50/70"}`}
                >
                    {b.lines.map((l, j) => (
                        <p key={j} className={j ? "mt-1.5" : ""}>
                            <Inline parts={l} />
                        </p>
                    ))}
                </div>
            );
        case "paragraph":
            return (
                <p key={i} className="my-2">
                    <Inline parts={b.body} />
                </p>
            );
        case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
                <Tag key={i} className={`my-2 space-y-1 pl-6 ${b.ordered ? "list-decimal" : "list-disc"}`}>
                    {b.items.map((it, j) => (
                        <li key={j}>
                            <Inline parts={it} />
                        </li>
                    ))}
                </Tag>
            );
        }
        case "table":
            return (
                <div key={i} className="my-3 overflow-x-auto">
                    <table className="w-full border-collapse text-[12px]">
                        <thead>
                            <tr>
                                {b.head.map((h, j) => (
                                    <th key={j} className="border-b border-alloy-midnight/20 px-2 py-1 text-left font-semibold">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {b.rows.map((row, r) => (
                                <tr key={r} className="align-top">
                                    {row.map((c, j) => (
                                        <td key={j} className="border-b border-alloy-midnight/10 px-2 py-1">
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
            return <hr key={i} className="my-6 border-alloy-midnight/10" />;
    }
}
