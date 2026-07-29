import ProvisioningAnswerSeed from "@/components/admin/workspace/ProvisioningAnswerSeed";
import { composeProvisioningAnswerForRoute } from "@/lib/runtime/provisioning/composeProvisioningAnswerForRoute";

type PageProps = {
    params: Promise<{ workUnitSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined): string | null =>
    typeof v === "string" && v.trim() !== "" ? v : null;

/**
 * ORDERING EXPERIMENT (Option B — docs/runtime/DEEPLINK-COMPOSE-OWNERSHIP.md).
 *
 * The queue surface mounts from `[workUnitSlug]/layout.tsx`; this segment renders no user-facing UI.
 * What it uniquely has is `searchParams` — a layout never receives them — so it is the only server
 * boundary that can know WHICH subject a deep link asked for.
 *
 * The historical objection ("a page-segment seed hydrates in a later streaming boundary and loses the
 * race to K2's consume") has been withdrawn: no commit ever landed a page seed, and the single
 * experiment behind that claim never mounted its seed at all, because the layout discarded `children`.
 * The real ordering requirement is a render-phase write inside `SurfaceHostProvider`'s subtree with no
 * intervening Suspense boundary — which this segment satisfies now that the layout renders `children`.
 *
 * THIS IS THE FALSIFIABLE TEST. The layout still composes the default subject, so the experiment
 * isolates ORDERING only: if the page's subject-specific seed is consumed, a valid deep link performs
 * ZERO client provisioning fetches. If it is not consumed, the seed loses and Option D is the
 * fallback. The duplicate compose is removed only after this passes — not before.
 */
export default async function OperatorWorkUnitSlugPage({ params, searchParams }: PageProps) {
    const [{ workUnitSlug }, sp] = await Promise.all([params, searchParams]);
    const requestedSubjectId = one(sp.subject_id);
    const requestedWorkViewId = one(sp.work_view_id);

    // No requested subject → nothing to add. The layout's bare-route seed already covers that case,
    // and composing again here would be the duplicate work this exercise exists to remove.
    if (!requestedSubjectId) return null;

    // The SAME tenant-authorized server path the HTTP seam uses. The subject id is a pass-through to
    // the composer, which validates it against the org-scoped evaluated page and — since the Subject
    // Authority fix — returns an honest error rather than substituting. No new trust is created here:
    // a malformed, stale, or cross-tenant id cannot select anything, and an error terminal seeds
    // nothing (K2 then falls back to its own fetch, which fails the same honest way).
    const answer = await composeProvisioningAnswerForRoute({
        rawSlug: workUnitSlug,
        requestedWorkViewId,
        requestedSubjectId,
    })
        .then((r) => (r.ok && r.answer.terminal !== "error" ? r.answer : null))
        .catch(() => null);

    return (
        <ProvisioningAnswerSeed
            target={workUnitSlug}
            lens={requestedWorkViewId}
            subject={requestedSubjectId}
            answer={answer}
        />
    );
}
