/**
 * Card 29 — Global Messaging scaffold (minimal V1 placeholder).
 * Full inbox/search/templates are out of scope; see sprint doc for API/data notes.
 */

export default function AdminV2MessagingScaffoldPage() {
    return (
        <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 text-alloy-forge">
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Admin V2 · Preview</p>
                <h1 className="mt-1 text-xl font-semibold text-alloy-midnight">Messaging</h1>
                <p className="mt-2 text-sm leading-relaxed text-alloy-midnight/68">
                    This route is an intentional scaffold — not an inbox replacement yet. Compose and threaded history remain on record
                    drawers today; messaging will unify search, recipients, and cross-record threads later.
                </p>
            </div>

            <section className="rounded-xl border border-alloy-stone/18 bg-white/90 p-4 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Recent conversations</h2>
                <p className="mt-2 text-sm text-alloy-midnight/62">Placeholder — aggregate thread list requires server API (org-scoped).</p>
            </section>

            <section className="rounded-xl border border-alloy-stone/18 bg-white/90 p-4 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Search recipient</h2>
                <p className="mt-2 text-sm text-alloy-midnight/62">
                    Planned: person/customer/org-scoped picker (person-first identity; no contacts as primary anchor).
                </p>
            </section>

            <section className="rounded-xl border border-alloy-stone/18 bg-white/90 p-4 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Compose</h2>
                <p className="mt-2 text-sm text-alloy-midnight/62">
                    Reuse <code className="text-[12px]">POST /api/admin/communications/send</code> eventually; bindings from{" "}
                    <code className="text-[12px]">communication_provider_bindings</code>; queue drain via dispatcher process route.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 opacity-55">
                    <span className="rounded border border-alloy-stone/24 px-2 py-1 text-[11px]">Email · later</span>
                    <span className="rounded border border-alloy-stone/24 px-2 py-1 text-[11px]">SMS · later</span>
                    <span className="rounded border border-alloy-stone/24 px-2 py-1 text-[11px]">In-app · later</span>
                </div>
            </section>
        </main>
    );
}
