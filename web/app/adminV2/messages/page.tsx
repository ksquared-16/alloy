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
                    This route is an intentional scaffold — not an inbox replacement yet. Use the header <strong>Messages</strong> control to
                    open the <strong>Quick message</strong> modal (person search + email/SMS send). Threaded history and full compose remain on
                    opportunity/job drawers; this page will later hold inbox and templates.
                </p>
            </div>

            <section className="rounded-xl border border-alloy-stone/18 bg-white/90 p-4 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Recent conversations</h2>
                <p className="mt-2 text-sm text-alloy-midnight/62">Placeholder — aggregate thread list requires server API (org-scoped).</p>
            </section>

            <section className="rounded-xl border border-alloy-stone/18 bg-white/90 p-4 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Search recipient</h2>
                <p className="mt-2 text-sm text-alloy-midnight/62">
                    Implemented in the header modal via <code className="text-[12px]">GET /api/admin/communications/person-search</code>{" "}
                    (org-scoped <code className="text-[12px]">persons</code> rows only; person-first).
                </p>
            </section>

            <section className="rounded-xl border border-alloy-stone/18 bg-white/90 p-4 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/44">Compose</h2>
                <p className="mt-2 text-sm text-alloy-midnight/62">
                    Quick send uses <code className="text-[12px]">POST /api/admin/communications/send</code> with{" "}
                    <code className="text-[12px]">quick_message: true</code> — threads anchor to the selected{" "}
                    <code className="text-[12px]">persons</code> row (no opportunity/job required). Bindings from{" "}
                    <code className="text-[12px]">communication_provider_bindings</code>; queue drain unchanged.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 opacity-55">
                    <span className="rounded border border-alloy-stone/24 px-2 py-1 text-[11px]">Email · quick modal</span>
                    <span className="rounded border border-alloy-stone/24 px-2 py-1 text-[11px]">SMS · quick modal</span>
                    <span className="rounded border border-alloy-stone/24 px-2 py-1 text-[11px]">In-app · later</span>
                </div>
            </section>
        </main>
    );
}
