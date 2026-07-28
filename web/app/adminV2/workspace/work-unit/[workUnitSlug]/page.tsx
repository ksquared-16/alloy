/**
 * Work-unit queue surface mounts from `[workUnitSlug]/layout.tsx` — page segment is a route anchor only.
 *
 * The Runtime V1 Realization provisioning SEED lives in the LAYOUT, not here: a page-segment seed
 * hydrates in a later streaming boundary than the shell's Surface Host, so K2's cold-load consume can
 * fire before it lands (measured: the seed lost the race and K2 cold-fetched). The layout co-locates the
 * seed with `WorkUnitSlugRouteHost`, whose render-phase write is proven to precede the Host's hydrate.
 */
export default function OperatorWorkUnitSlugPage() {
    return null;
}
