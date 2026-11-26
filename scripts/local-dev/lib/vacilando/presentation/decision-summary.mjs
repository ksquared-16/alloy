/**
 * Director Decision Summary — executive briefing from durable decision records.
 *
 * Workers keep producing detailed reasoning. Director interprets that into a
 * short briefing the operator can understand in ~30 seconds.
 *
 * Presentation only. Does not mutate decision runtime persistence.
 */

const ENGINEERING_NOISE = [
  /raised by claude/i,
  /execution session/i,
  /session id/i,
  /worker context/i,
  /compiled package/i,
  /null evidence/i,
  /unfalsifiable/i,
  /session resume/i,
  /heartbeat/i,
  /token usage/i,
];

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function isEngineeringNoise(text) {
  const t = clean(text);
  if (!t) return true;
  if (t.length < 12) return true;
  return ENGINEERING_NOISE.some((re) => re.test(t) && t.length < 80);
}

function corpus(decision) {
  return [
    decision.title,
    decision.situation,
    decision.whyThisMatters,
    decision.discovery,
    decision.recommendation,
    decision.recommendationReason,
    ...(decision.options || []).map((o) => `${o.label} ${o.description}`),
  ].map(clean).join(" \n ");
}

/** Resolve which option is recommended — id, label match, or fuzzy prose match. */
export function resolveRecommendedOption(decision) {
  const options = decision.options || [];
  if (!options.length) return null;
  const rec = clean(decision.recommendation);
  if (!rec) return options[0];
  const byId = options.find((o) => (o.optionId || o.id) === rec);
  if (byId) return byId;
  const byLabel = options.find((o) => clean(o.label).toLowerCase() === rec.toLowerCase());
  if (byLabel) return byLabel;
  const recommendedTagged = options.find((o) => /\(recommended\)/i.test(o.label));
  if (recommendedTagged) return recommendedTagged;
  // Prose recommendation often restates option A description — pick best overlap.
  let best = null;
  let bestScore = 0;
  for (const o of options) {
    const label = clean(o.label).toLowerCase();
    const desc = clean(o.description).toLowerCase();
    const hay = `${label} ${desc}`;
    let score = 0;
    for (const word of rec.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4)) {
      if (hay.includes(word)) score += 1;
    }
    if (/\bgap\b/i.test(rec) && /\bgap\b/i.test(hay)) score += 3;
    if (/do not implement|discovery/i.test(rec) && /discovery|gap|scoped/i.test(hay)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return bestScore >= 2 ? best : (recommendedTagged || options[0]);
}

function inferStopReason(decision, text) {
  if (/forbids? implementation|do not (materially )?implement|conflicting instruction|contradict/i.test(text)) {
    return "I stopped because I found conflicting instructions.";
  }
  if (/already (been )?(completed|accepted|covered)|redo|re-?deriv/i.test(text)) {
    return "I stopped because continuing would repeat work that was already accepted.";
  }
  if (/disagree|conflict|opposite work|two readings/i.test(text)) {
    return "I stopped because two accepted artifacts disagree.";
  }
  if (/product (choice|call|decision)|how should|requires a (product )?choice/i.test(text)) {
    return "I stopped because implementation requires a product choice.";
  }
  if (/wrong result|unsafe|risk/i.test(text)) {
    return "I stopped because continuing would likely produce the wrong result.";
  }
  const title = clean(decision.title);
  if (title && title.length < 120 && !isEngineeringNoise(title)) {
    return `I stopped because I need your call on this: ${title.replace(/\?$/, "")}.`;
  }
  return "I stopped because continuing without your direction would be unsafe.";
}

function inferSituation(decision, text) {
  // Prefer translating known Access & Identity / brief-conflict pattern.
  if (/forbids? implementation|do not (materially )?implement/i.test(text)
    && (/compiled|kind=.?implement|implement/i.test(text))) {
    return [
      "Your Mission Brief says not to implement the product yet — it asks for discovery and specification work.",
      "The plan Vacilando prepared treated this as implementation work instead.",
      "I also found that much of the requested discovery already exists and was accepted, while a few important gaps remain.",
      "I cannot follow both instructions at once.",
    ].join(" ");
  }
  if (/already (been )?(accepted|covered)|seven accepted|accepted corpus/i.test(text)) {
    return [
      "I found work that appears to have already been completed and accepted.",
      "Starting fresh would redo that work.",
      "I need you to choose whether to reuse it or intentionally rewrite it.",
    ].join(" ");
  }

  const situation = clean(decision.situation);
  const why = clean(decision.whyThisMatters);
  const parts = [];
  if (situation && !isEngineeringNoise(situation)) {
    // Soften engineering phrasing without forwarding raw jargon.
    let s = situation
      .replace(/Mission\s+msn_[a-f0-9]+/gi, "This mission")
      .replace(/kind=['"]?implement['"]?/gi, "implementation")
      .replace(/requiredOutputs=\[[^\]]*\]/gi, "no clear required outputs")
      .replace(/approvalGate=['"]?[^'",\s]+['"]?/gi, "")
      .replace(/AC\d+/g, "an acceptance check")
      .replace(/unfalsifiable[^.]*/gi, "an acceptance check that cannot be verified")
      .replace(/null evidence[^.]*/gi, "missing proof requirements")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length > 420) s = `${s.slice(0, 400).replace(/\s+\S*$/, "")}…`;
    parts.push(s);
  }
  if (why && !isEngineeringNoise(why) && !parts.join(" ").includes(why.slice(0, 40))) {
    let w = why
      .replace(/unfalsifiable[^.]*/gi, "an acceptance check that cannot be verified")
      .replace(/null evidence[^.]*/gi, "missing proof requirements")
      .replace(/\s+/g, " ")
      .trim();
    if (w.length > 280) w = `${w.slice(0, 260).replace(/\s+\S*$/, "")}…`;
    parts.push(w);
  }
  if (parts.length) return parts.join(" ");
  return "I found a product question that needs your direction before work can continue safely.";
}

function inferWhyStopped(decision, text) {
  if (/forbids? implementation|do not (materially )?implement/i.test(text)
    && (/accepted|redo|re-?deriv|covered/i.test(text))) {
    return {
      lead: "If I continue now, I will either:",
      bullets: [
        "ignore your instruction not to implement, or",
        "redo discovery work that has already been accepted.",
      ],
      close: "I stopped before either occurred.",
    };
  }
  if (/opposite work|contradict|conflict/i.test(text)) {
    return {
      lead: "If I continue now, workers will follow one reading and discard the other.",
      bullets: [
        "That creates rework, or",
        "ships the wrong kind of outcome.",
      ],
      close: "I stopped so you can choose the path.",
    };
  }
  const why = clean(decision.whyThisMatters);
  if (why && !isEngineeringNoise(why)) {
    return {
      lead: "If I continue without your decision:",
      bullets: [why.length > 220 ? `${why.slice(0, 200)}…` : why],
      close: "I paused affected work until you choose.",
    };
  }
  return {
    lead: "If I continue without your decision, I risk doing the wrong work.",
    bullets: ["Paused work stays paused until you answer."],
    close: "I stopped to protect the mission outcome.",
  };
}

function splitWhyBullets(reason, recommendationLabel) {
  const r = clean(reason);
  if (!r) {
    return [
      "keeps the mission aligned with your brief",
      "avoids unnecessary rework",
      "lets execution continue with a clear mandate",
    ];
  }
  const chunks = r
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((s) => s.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, ""));
  if (chunks.length >= 2) return chunks;
  return [
    recommendationLabel ? `best matches “${recommendationLabel}”` : "is the clearest path forward",
    r.length > 180 ? `${r.slice(0, 160)}…` : r,
  ];
}

function whenToChoose(option, isRecommended) {
  const desc = clean(option.description);
  if (isRecommended) return "Director’s default path — choose this unless you have a specific reason not to.";
  if (/rewrite|full|entire|from the brief|re-deriv/i.test(`${option.label} ${desc}`)) {
    return "Useful if you intentionally want to rewrite every accepted artifact.";
  }
  if (/implement|build|code/i.test(`${option.label} ${desc}`)) {
    return "Choose only if you are ready to start building product now.";
  }
  if (/fix|ingestion|vacilando/i.test(`${option.label} ${desc}`)) {
    return "Choose if platform correctness matters more than finishing this mission’s gaps first.";
  }
  if (desc) return desc.length > 140 ? `${desc.slice(0, 120)}…` : desc;
  return "Choose if this path better matches your intent.";
}

function inferImpact(decision, recommended) {
  const impact = decision.impact || {};
  const bits = [];
  if (impact.schedule) bits.push(String(impact.schedule));
  if (impact.product) bits.push(String(impact.product));
  if (impact.security) bits.push(`Security: ${impact.security}`);
  if (impact.data) bits.push(`Data: ${impact.data}`);

  const desc = clean(recommended?.description || decision.recommendationReason || "");
  const estimated = [];
  if (/fastest|no accepted work|carry .+ forward|scoped to the gap/i.test(desc)
    || /scoped to the gap|carry .+ forward/i.test(clean(decision.recommendation))) {
    estimated.push("Low risk");
    estimated.push("~2–4 focused phases");
    estimated.push("No accepted work repeated");
  } else if (/substantially more|rewrite|full four/i.test(desc)) {
    estimated.push("Higher effort");
    estimated.push("Accepted work may be redone");
  } else if (/implement/i.test(clean(recommended?.label))) {
    estimated.push("Starts product implementation");
    estimated.push("May conflict with the Mission Brief");
  } else {
    estimated.push(bits[0] || "Limited blast radius if you choose carefully");
    if (bits[1]) estimated.push(bits[1]);
  }
  return {
    lines: estimated,
    raw: impact,
  };
}

function inferAfterEffects(decision, recommended) {
  const label = clean(recommended?.label || "your choice");
  const approve = [
    "Record your decision on the mission",
    "Update the Mission Brief / plan when the choice changes intent",
    "Regenerate or refresh assignments as needed",
    "Resume paused workers",
    "Continue execution on the path you chose",
  ];
  const reject = [
    "Keep work paused",
    "Ask for clearer direction from you",
    "Rewrite the recommendation before resuming",
  ];
  // Tailor approval copy for gap-scoped discovery.
  if (/gap|scoped|discovery/i.test(`${label} ${recommended?.description || ""}`)) {
    return {
      approval_result: "Director will re-scope the mission to the remaining specification gaps, reuse accepted work, refresh assignments, and resume paused workers.",
      rejection_result: "Director will keep work paused and wait for different direction — nothing resumes until you choose another path or give new instructions.",
      approval_steps: [
        "Update the Mission Brief to discovery scoped to remaining gaps",
        "Carry accepted artifacts forward as inputs",
        "Regenerate assignments for the remaining work",
        "Resume paused workers",
        "Continue execution",
      ],
      rejection_steps: reject,
    };
  }
  return {
    approval_result: `Director will follow “${label}”, refresh affected work, and resume paused workers.`,
    rejection_result: "Director will keep work paused and wait for new direction from you.",
    approval_steps: approve,
    rejection_steps: reject,
  };
}

/**
 * Build the Director Decision Summary view model from a durable decision record.
 */
export function buildDirectorDecisionSummary(decision) {
  if (!decision) return null;
  const text = corpus(decision);
  const recommended = resolveRecommendedOption(decision);
  const recId = recommended?.optionId || recommended?.id || decision.recommendation;
  const recLabel = clean(recommended?.label || "").replace(/\s*\(recommended\)\s*$/i, "")
    || clean(decision.recommendation)
    || "Director’s recommended path";
  const stop_reason = inferStopReason(decision, text);
  const situation_summary = inferSituation(decision, text);
  const why = inferWhyStopped(decision, text);
  const recommendation_summary = recommended?.description
    ? `I recommend ${recLabel.charAt(0).toLowerCase()}${recLabel.slice(1)}.`.replace(/\.\.$/, ".")
    : (clean(decision.recommendation)?.length < 180
      ? clean(decision.recommendation)
      : `I recommend ${recLabel}.`);
  // Prefer a crisp executive one-liner when the path is "finish gaps / reuse accepted".
  let recommendationOneLiner = recommendation_summary;
  const recBlob = `${recLabel} ${recommended?.description || ""} ${decision.recommendation || ""}`;
  if (/gap|carry .+ forward|accepted (corpus|work)|no accepted work/i.test(recBlob)) {
    recommendationOneLiner = "I recommend completing only the remaining specification gaps and reusing the accepted work.";
  } else if (recommended?.description) {
    const d = clean(recommended.description);
    recommendationOneLiner = d.length <= 160 ? `I recommend: ${d}` : `I recommend ${recLabel}.`;
  }
  const recommendation_why = splitWhyBullets(decision.recommendationReason, recLabel);
  const impact = inferImpact(decision, recommended);
  const after = inferAfterEffects(decision, recommended);

  const alternatives = (decision.options || [])
    .filter((o) => (o.optionId || o.id) !== recId)
    .map((o) => ({
      id: o.optionId || o.id,
      title: clean(o.label).replace(/\s*\(recommended\)\s*$/i, ""),
      description: clean(o.description).length > 160
        ? `${clean(o.description).slice(0, 140)}…`
        : clean(o.description),
      whenToChoose: whenToChoose(o, false),
      isRecommended: false,
    }));

  return {
    schema_version: "vacilando.director_decision_summary.v1",
    decisionId: decision.decisionId,
    missionId: decision.missionId,
    stop_reason,
    situation_summary,
    why_stopped: why,
    recommendation_summary: recommendationOneLiner,
    recommendation_label: recLabel,
    recommendation_id: recId,
    recommendation_why,
    impact_summary: impact.lines,
    approval_result: after.approval_result,
    rejection_result: after.rejection_result,
    approval_steps: after.approval_steps,
    rejection_steps: after.rejection_steps,
    plain_language_explanation: [
      stop_reason,
      situation_summary,
      recommendationOneLiner,
    ].join(" "),
    recommended_card: {
      id: recId,
      title: recLabel,
      description: clean(recommended?.description || decision.recommendationReason || recommendationOneLiner),
      whenToChoose: whenToChoose(recommended || { label: recLabel, description: "" }, true),
      impact: impact.lines,
      isRecommended: true,
    },
    alternative_cards: alternatives,
    technical: {
      title: decision.title,
      situation: decision.situation,
      whyThisMatters: decision.whyThisMatters,
      currentPlan: decision.currentPlan,
      discovery: decision.discovery,
      recommendation_raw: decision.recommendation,
      recommendationReason: decision.recommendationReason,
      impact_raw: decision.impact || {},
      evidence: decision.evidence || [],
      affectedAssignments: decision.affectedAssignments || [],
      options_raw: decision.options || [],
      created_by: decision.created_by,
      created_at: decision.created_at,
      status: decision.status,
      chosen_option_id: decision.chosen_option_id,
      response: decision.response,
    },
  };
}

/** Timeline copy derived from a decision (presentation). */
export function decisionTimelineCopy(decision, { answered = false, chosenOptionId = null } = {}) {
  if (!decision) {
    return answered
      ? {
          headline: "You answered Director’s recommendation",
          explanation: "Director resumed execution.",
        }
      : {
          headline: "Director paused work for your decision",
          explanation: "A product choice is required before work can continue.",
        };
  }
  const summary = buildDirectorDecisionSummary(decision);
  if (!answered) {
    return {
      headline: summary.stop_reason.replace(/^I stopped/, "Director paused work"),
      explanation: summary.situation_summary,
    };
  }
  const chosen = (decision.options || []).find((o) => (o.optionId || o.id) === chosenOptionId);
  const choseRecommended = chosenOptionId
    && (chosenOptionId === summary.recommendation_id
      || clean(chosenOptionId) === clean(decision.recommendation));
  if (choseRecommended || !chosenOptionId) {
    return {
      headline: "You approved Director’s recommendation",
      explanation: "Director resumed execution.",
    };
  }
  return {
    headline: `You chose: ${clean(chosen?.label || chosenOptionId)}`,
    explanation: "Director will follow your direction and resume when ready.",
  };
}
