"use client";

import { useEffect, useState } from "react";

/**
 * One step at a time.
 *
 * The previous harness put the whole lifecycle on the screen at once — eight gates, every expectation,
 * the implementation history and the reasoning behind it. That is a certification document, and the
 * person using this is testing a product, not auditing one. So this shows the step you are on, says
 * what to do, asks what happened, and stops.
 *
 * It also survives a reload. The QA server is meant to be a production build, but when it is running
 * in development mode an engineer saving a file reloads the page under the reader. Keeping the current
 * step in this browser means that costs you your scroll position and nothing else.
 */

const STEP_KEY = "alloy.real-enrollment-qa.step";

type Step = {
    readonly gate: string;
    readonly title: string;
    readonly lead: string;
    /** What to go and do, in the product. */
    readonly doThis: readonly string[];
    /** Soft prompts. Not a checklist — things people tend to notice, offered after the fact. */
    readonly noticing: readonly string[];
    /** Where in Alloy, when there is a stable place to send them. */
    readonly open?: { readonly label: string; readonly href: string };
};

const STEPS: readonly Step[] = [
    {
        gate: "H1",
        title: "Add your paperwork",
        lead: "Start with the Enrollment paperwork you actually use. Not a sample, and not something Alloy already knows about.",
        doThis: [
            "Open Processing in Alloy and use Import document.",
            "Choose your own Enrollment paperwork — a PDF, Word file, web page, image, text or CSV all work.",
            "Alloy will ask what it should do with the document. Choose what you think is right.",
        ],
        noticing: [
            "Was it obvious where to bring a document in?",
            "Did your document upload cleanly?",
            "Were the choices Alloy offered understandable?",
            "Was it clear what would happen next?",
        ],
        open: { label: "Open Processing", href: "/workspace/processing" },
    },
    {
        gate: "H2",
        title: "Let Alloy read it",
        lead: "Alloy now reads the document and turns it into something you can review.",
        doThis: ["Start the analysis and wait for it to finish."],
        noticing: [
            "Did you know it was working?",
            "How long did it take?",
            "Did it tell you how confident it was?",
            "If something went wrong, could you retry?",
        ],
    },
    {
        gate: "H3",
        title: "Review what Alloy found",
        lead: "Alloy shows you the form it built. Read down it beside your document.",
        doThis: [
            "Look through the form Alloy built and tell us what feels wrong.",
            "Anything marked as needing your decision is highlighted — see whether you can tell what it is asking.",
        ],
        noticing: [
            "Wording — does it say what the paper says?",
            "The kind of answer each question asks for.",
            "Order, and the sections it grouped things into.",
            "Anything that is not really a question.",
            "Signatures and things a parent agrees to.",
            "People who repeat — guardians, emergency contacts, children.",
            "Addresses.",
            "Where Alloy says it already knows something — is that believable?",
            "Any question you cannot tell why Alloy created.",
        ],
    },
    {
        gate: "H4",
        title: "Fix what it got wrong",
        lead: "Correct anything that is not right, using Alloy's own controls.",
        doThis: ["Make the corrections you would want to make before showing this to a family."],
        noticing: [
            "Could you fix it, or only see that it was wrong?",
            "Did a correction stick?",
            "Did fixing one thing disturb another?",
            "If nothing needed fixing, say so — that is a result too.",
        ],
    },
    {
        gate: "H5",
        title: "Turn it into a Form",
        lead: "Make it a real Alloy Form.",
        doThis: ["Use Alloy's action to create the Form from what you reviewed."],
        noticing: [
            "Is it clearly a draft rather than something families can already see?",
            "Can you tell it came from your document?",
            "Would you be willing to publish this?",
        ],
    },
    {
        gate: "H6",
        title: "Build the Enrollment process",
        lead: "Now set up what a family has to do, using the Form you just made.",
        doThis: [
            "Open the Enrollment process and find the Enrolling stage.",
            "Add your Form, the Family Handbook and the Immunization record.",
            "Put them in the order you want, and decide which are required, which block, and which must be done before the stage can be left.",
            "Add the enrollment fee.",
            "Publish the revision.",
        ],
        noticing: [
            "Could you do all of that unaided?",
            "Was the difference between required, blocking and stage-exit clear?",
            "Was the fee's per-child or per-family choice understandable?",
            "Did you know what you had published?",
        ],
        open: { label: "Open Organization", href: "/workspace/organization" },
    },
    {
        gate: "H7",
        title: "Send it to a family",
        lead: "Become the operator sending the paperwork out.",
        doThis: [
            "Find a child who is enrolling and start their Enrollment if they have not started.",
            "Send the enrollment paperwork, read the review, and confirm.",
        ],
        noticing: [
            "Did the review tell you what the family is about to get?",
            "Did confirming feel like a decision?",
            "Could you tell it had been sent?",
        ],
        open: { label: "Open Workspace", href: "/workspace" },
    },
    {
        gate: "H8",
        title: "Become the parent",
        lead: "Open the family's link and go through it as a parent would.",
        doThis: [
            "Complete the Admissions questions, acknowledge the Handbook and attach the Immunization record.",
            "Leave part way through and come back.",
            "Finish, and deal with the fee when it appears.",
        ],
        noticing: [
            "Does this feel like enrolling a child, or like filling in a form?",
            "Did it ask you for things Alloy already knows?",
            "Did your answers survive leaving and coming back?",
            "Did the fee arrive at a sensible moment, and was the amount understandable?",
            "On a phone?",
        ],
    },
];

export default function HumanQaGuide() {
    const [index, setIndex] = useState(0);
    const [restored, setRestored] = useState(false);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(STEP_KEY);
            const n = raw == null ? 0 : Number.parseInt(raw, 10);
            if (Number.isFinite(n) && n >= 0 && n < STEPS.length) setIndex(n);
        } catch {
            /* A private window is not an error here. */
        }
        setRestored(true);
    }, []);

    const go = (next: number) => {
        const clamped = Math.max(0, Math.min(STEPS.length - 1, next));
        setIndex(clamped);
        try {
            window.localStorage.setItem(STEP_KEY, String(clamped));
        } catch {
            /* Losing the place is survivable; blocking the click is not. */
        }
    };

    const step = STEPS[index]!;

    return (
        <section data-qa-guide="true" data-qa-step={step.gate}>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                Step {index + 1} of {STEPS.length}
            </p>
            <h1 className="mt-1 text-[26px] font-semibold leading-tight text-alloy-midnight">{step.title}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-alloy-midnight/80">{step.lead}</p>

            <ol className="mt-5 space-y-2">
                {step.doThis.map((line, i) => (
                    <li key={line} className="flex gap-3 text-[14px] leading-relaxed text-alloy-midnight">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-alloy-midnight text-[11px] font-semibold text-white">
                            {i + 1}
                        </span>
                        <span>{line}</span>
                    </li>
                ))}
            </ol>

            {step.open ? (
                <a
                    href={step.open.href}
                    target="_blank"
                    rel="noreferrer"
                    data-qa-open-product="true"
                    className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white"
                >
                    {step.open.label}
                </a>
            ) : null}

            <div className="mt-6 rounded-2xl border border-alloy-midnight/12 bg-alloy-midnight/[0.02] p-4">
                <p className="text-[14px] font-semibold text-alloy-midnight">Then tell us what happened.</p>
                <p className="mt-1 text-[13px] leading-relaxed text-alloy-midnight/70">
                    Use the Notes button in the corner. Anything that felt wrong, slow, confusing or missing is
                    worth writing down — including &ldquo;this was fine&rdquo;.
                </p>
                <ul className="mt-3 space-y-1">
                    {step.noticing.map((n) => (
                        <li key={n} className="text-[13px] leading-relaxed text-alloy-midnight/70">
                            {n}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => go(index - 1)}
                    disabled={index === 0}
                    data-qa-step-back="true"
                    className="min-h-[44px] rounded-xl border border-alloy-midnight/15 px-4 text-[14px] text-alloy-midnight/70 disabled:opacity-40"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={() => go(index + 1)}
                    disabled={index === STEPS.length - 1}
                    data-qa-step-next="true"
                    className="min-h-[44px] rounded-xl bg-alloy-bend-pine px-4 text-[14px] font-medium text-white disabled:opacity-40"
                >
                    I&rsquo;ve done this &mdash; next step
                </button>
                <span className="text-[12px] text-alloy-midnight/45">
                    {restored ? "Your place is kept in this browser." : ""}
                </span>
            </div>

            <p className="mt-6 text-[12px] leading-relaxed text-alloy-midnight/45">
                After these eight steps there are three more: the documents the packet produces, Processing and
                finalisation, and whether the child is actually enrolled. They come later — one thing at a time.
            </p>
        </section>
    );
}
