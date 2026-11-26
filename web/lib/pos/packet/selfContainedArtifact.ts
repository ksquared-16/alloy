/**
 * An artifact whose choices belong to the artifact, not to the packet.
 *
 * The Nonmedical Exemption page is a self-contained legal instrument. Its checkboxes — "the vaccine
 * module approved by the Oregon Health Authority", "a health care practitioner", "Religious belief"
 * — are not enrollment questions Alloy should hoist into a packet-wide interview. They select among
 * obligations THIS page carries, and they are meaningful only beside the acknowledgements printed
 * around them.
 *
 * Getting this wrong is not cosmetic. Hoisted, "Religious" becomes a bare enrollment question the
 * school never asked and Alloy has no business storing. Left in place, it stays what the state form
 * made it: a control on a document a family may choose to complete.
 *
 * The test is STRUCTURAL, never the artifact's title: an artifact is self-contained when its own
 * choices select among obligations it also carries. A page with checkboxes but no obligations is
 * just a page with questions.
 *
 * Pure + deterministic. No I/O.
 */

import type { ArtifactConcept } from "./paymentSetupArtifact";

/** Concept kinds that are an obligation the page itself imposes. */
const OBLIGATION_KINDS = new Set(["upload_requirement", "acknowledgement"]);

export function classifySelfContainedArtifact(concepts: ArtifactConcept[]): {
    isSelfContained: boolean;
    choiceCount: number;
    obligationCount: number;
    basis: string;
} {
    const choiceCount = concepts.filter((c) => c.kind === "choice_field").length;
    const obligationCount = concepts.filter((c) => OBLIGATION_KINDS.has(c.kind)).length;

    // Two of each. One checkbox beside one acknowledgement is an ordinary consent, which is already
    // modelled as a consent and must not be swept in here.
    const isSelfContained = choiceCount >= 2 && obligationCount >= 2;
    return {
        isSelfContained,
        choiceCount,
        obligationCount,
        basis: isSelfContained
            ? `${choiceCount} choices selecting among ${obligationCount} obligations this artifact carries`
            : `${choiceCount} choices, ${obligationCount} obligations — not a self-contained instrument`,
    };
}
