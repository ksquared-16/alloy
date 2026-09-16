/**
 * THE ASYNC WORK A MOUNTED FOCUS PANEL CARD ABANDONS ON PURPOSE.
 *
 * `CurrentWorkCard` warms configured capabilities from a mount effect: as soon as What's Next shows
 * its actions, `warmCurrentWorkCapabilitiesForActions` preloads the chunk each capability's host will
 * need, so the centered host opens on warmed content instead of a blank pause. It does that with
 *
 *     void importer();
 *
 * — deliberately discarded, because in a browser nobody waits for speculation. The promise never
 * leaves the product, so a test CANNOT await it: there is nothing to await.
 *
 * In vitest that is a race against teardown. The test body finishes, vitest disposes the jsdom
 * environment, and any chunk still resolving is reported as `EnvironmentTeardownError: Cannot load
 * '…' after the environment was torn down`. All assertions pass; the process still exits non-zero.
 *
 * ── WHY THE MODULE NAME KEPT CHANGING ──
 *
 * Which chunks are requested depends on which capability HOST each fixture's actions resolve to —
 * a communications composer, an inline form, a form delivery surface. The render matrix mounts nine
 * different fixtures, so a different set is warmed each time, and whichever import happens to still
 * be in flight when teardown lands is the one that gets named. `assertRowOrg`, `accessScope`,
 * `inquiryChildPlacementScope`, `BosWorkspaceShell`, `ComposerBosEnhanceModal` are all reached
 * THROUGH those chunks — never imported by the test, which is why the stack pointed at a file that
 * does not mention them.
 *
 * ── WHAT THIS DOES ──
 *
 * Resolves those chunks BEFORE the tests run. The dispatcher still executes exactly as it does in
 * production — this neither stubs it nor changes it — but its `import()` now resolves from the
 * module cache, so nothing is in flight when the environment goes away.
 *
 * Speculation itself is certified where it belongs: `tests/adminV2/speculationMayNotMutate.test.ts`
 * holds the rule that none of this may mutate. Nothing here weakens that.
 */

/**
 * The chunks `warmCurrentWorkCapabilities` preloads, as static thunks.
 *
 * Static rather than a computed `import(specifier)` so the bundler can see them, and keyed by the
 * exact specifier so `speculativeChunkCoverage` can prove this list still matches the dispatcher.
 * A warm target added without an entry here would silently restore the race.
 */
export const SPECULATIVE_CHUNK_IMPORTERS: Readonly<Record<string, () => Promise<unknown>>> = {
    "@/components/admin/communications/CommunicationsDrawerSection": () =>
        import("@/components/admin/communications/CommunicationsDrawerSection"),
    "@/components/admin/focusPanel/cards/CurrentWorkAddChildPanel": () =>
        import("@/components/admin/focusPanel/cards/CurrentWorkAddChildPanel"),
};

/**
 * Resolve every speculative chunk a mounted card may warm. Call from `beforeAll`.
 *
 * Returns the specifiers it settled, so a caller can assert it actually did something rather than
 * silently settling an empty list.
 */
export async function settleSpeculativeChunks(): Promise<string[]> {
    const specifiers = Object.keys(SPECULATIVE_CHUNK_IMPORTERS);
    await Promise.all(specifiers.map((s) => SPECULATIVE_CHUNK_IMPORTERS[s]!()));
    return specifiers;
}
