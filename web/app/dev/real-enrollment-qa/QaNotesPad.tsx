"use client";

import { useEffect, useState } from "react";

/**
 * Somewhere to write findings down while walking the product.
 *
 * ## Why it is docked rather than placed
 *
 * The first version sat in the page above the script, and the script told the Director it "stays with
 * you as you scroll". It did not: it scrolled away with everything else, so notes could only be
 * written by scrolling back to the top — which, halfway through a participant walkthrough on a phone,
 * means not writing them. A note you have to go and find is a note that does not get taken.
 *
 * So it is fixed to the viewport and collapsed by default. Collapsed it is a pill in the bottom
 * corner and covers nothing — not the walkthrough, and not the participant-launch card. Expanded it
 * is a panel the reader opened on purpose, with a close control, and on a narrow screen it becomes a
 * bottom sheet rather than a sidebar nobody can read a form beside.
 *
 * Deliberately not a tracker. Persisting QA issues would mean a schema, an owner and a lifecycle, and
 * none of that helps the person who has just noticed something. The text stays in this browser so a
 * reload does not lose it, and goes out on one click.
 */

const STORAGE_KEY = "alloy.real-enrollment-qa.notes";

const CATEGORIES = [
    ["BLOCKER", "a family could not get through this"],
    ["PRODUCT / UX", "it works, but it is not good enough"],
    ["CONFIGURATION", "the wrong thing was set up"],
    ["RUNTIME DEFECT", "an error, a blank screen, something did not save"],
    ["DATA / CONTENT", "wrong name, wrong child, bad wording, wrong amount"],
    ["QUESTION", "not sure whether that was intended"],
] as const;

export default function QaNotesPad() {
    const [notes, setNotes] = useState("");
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        try {
            setNotes(window.localStorage.getItem(STORAGE_KEY) ?? "");
        } catch {
            /* Private windows and blocked site data are not errors here. */
        }
    }, []);

    const update = (value: string) => {
        setNotes(value);
        setCopied(false);
        try {
            window.localStorage.setItem(STORAGE_KEY, value);
        } catch {
            /* Losing the draft is survivable; failing to type is not. */
        }
    };

    const add = (category: string) => update(`${notes}${notes && !notes.endsWith("\n") ? "\n" : ""}${category}: `);

    // What the pill reports, so the Director can see there is something in there without opening it.
    const lineCount = notes.split("\n").filter((l) => l.trim()).length;

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-qa-notes-toggle="true"
                aria-expanded={false}
                className="fixed bottom-4 right-4 z-40 flex min-h-[48px] items-center gap-2 rounded-full bg-alloy-midnight px-5 text-[14px] font-medium text-white shadow-lg"
            >
                Notes
                {lineCount ? (
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[12px] tabular-nums">{lineCount}</span>
                ) : null}
            </button>
        );
    }

    return (
        <div
            data-qa-notes-panel="true"
            className="fixed inset-x-2 bottom-2 z-40 max-h-[80vh] overflow-y-auto rounded-2xl border border-alloy-midnight/15 bg-white p-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]"
        >
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-alloy-midnight">What you found</h2>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    data-qa-notes-toggle="true"
                    aria-expanded
                    className="min-h-[36px] rounded-lg px-2 text-[13px] text-alloy-midnight/60"
                >
                    Close
                </button>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-alloy-midnight/65">
                Tag each note so taste and breakage do not get confused for each other. Kept in this browser as
                you type.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
                {CATEGORIES.map(([label, hint]) => (
                    <button
                        key={label}
                        type="button"
                        title={hint}
                        onClick={() => add(label)}
                        className="min-h-[36px] rounded-full border border-alloy-midnight/15 bg-white px-3 text-[12px] font-medium text-alloy-midnight/80"
                    >
                        {label}
                    </button>
                ))}
            </div>

            <textarea
                value={notes}
                onChange={(e) => update(e.target.value)}
                rows={8}
                placeholder="BLOCKER: the fee appeared before the Handbook was acknowledged"
                data-qa-notes="true"
                className="mt-3 w-full rounded-xl border border-alloy-midnight/15 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-alloy-midnight outline-none focus:border-alloy-bend-pine/40"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => {
                        void navigator.clipboard?.writeText(notes).then(
                            () => setCopied(true),
                            () => setCopied(false),
                        );
                    }}
                    disabled={!notes.trim()}
                    className="min-h-[40px] rounded-xl bg-alloy-midnight px-4 text-[13px] font-medium text-white disabled:opacity-40"
                >
                    {copied ? "Copied" : "Copy notes"}
                </button>
                <button
                    type="button"
                    onClick={() => update("")}
                    disabled={!notes}
                    className="min-h-[40px] rounded-xl border border-alloy-midnight/15 px-4 text-[13px] text-alloy-midnight/70 disabled:opacity-40"
                >
                    Clear
                </button>
            </div>
        </div>
    );
}
