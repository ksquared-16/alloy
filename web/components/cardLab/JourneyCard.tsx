"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ProgressionBand from "@/components/operationalCards/ProgressionBand";
import { FooterAction } from "@/components/cardLab/CardLabKit";
import type { JourneyEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Journey — "Where did this record start, what has it passed through, and where is it now?"
 *
 * Timeline archetype at `span: "row"`, which the grid already grants (1023px). It is an
 * ORIENTATION strip, not a report: one column per configured Business Process stage, one summary
 * line in the header, and one folded supporting line per stage. Skipped, revisited and reopened
 * stages, and the events behind each outcome, belong to View journey — the band never grows a
 * second row, and the card never grows a second summary line.
 *
 * Work Views are operator lenses and are deliberately NOT the spine; stages are.
 */
export default function JourneyCard({
    evidence,
    onViewJourney,
}: {
    evidence: JourneyEvidence;
    onViewJourney?: () => void;
}) {
    return (
        <div className="alloy-os-journey" data-journey-card="true">
            <UniversalCard
                title={evidence.processLabel}
                insight={evidence.answerLine}
                iconName="GitBranch"
                tier="context"
                archetype="timeline"
                density="compact"
                gridSpan="row"
                data-universal-card-key="process_journey"
                footerAction={<FooterAction onClick={onViewJourney}>View journey →</FooterAction>}
            >
                <ProgressionBand steps={evidence.stages} dataName="journey" compact />
            </UniversalCard>
        </div>
    );
}
