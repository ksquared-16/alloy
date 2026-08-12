import ProvisioningAnswerSeed from "@/components/admin/workspace/ProvisioningAnswerSeed";
import { composeProvisioningAnswerForRoute } from "@/lib/runtime/provisioning/composeProvisioningAnswerForRoute";
import { toRscPlainJson } from "@/lib/runtime/toRscPlainJson";

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
 * MEASURED, and the ordering holds: on a valid deep link the page's subject-keyed seed registered at
 * 3839ms and was consumed at 3842ms — it wins, in the same commit, and the layout's own seed fired at
 * the same instant, so this boundary is not later. Composed subject = requested = visible; zero client
 * provisioning fetch for the initial navigation.
 *
 * Because the ordering holds, this segment now owns provisioning composition for BOTH cases — a
 * requested subject and the bare default. That is what makes "exactly one compose" true: the layout no
 * longer composes at all, so no default-subject answer is produced and discarded on a deep link.
 */
export default async function OperatorWorkUnitSlugPage({ params, searchParams }: PageProps) {
    const [{ workUnitSlug }, sp] = await Promise.all([params, searchParams]);
    const requestedSubjectId = one(sp.subject_id);
    const requestedWorkViewId = one(sp.work_view_id);

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
            answer={answer ? toRscPlainJson(answer) : null}
            producer={`page(subject=${requestedSubjectId ?? "null"})`}
        />
    );
}
