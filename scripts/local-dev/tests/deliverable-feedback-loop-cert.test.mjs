/**
 * End-to-end certification: Director feedback loop on deliverable reviews.
 *
 * Proves durable share → Director input → Director response → VM thread,
 * request-changes, recheck semantics, isolation, auth, idempotency, restart,
 * and certify-note trigger behavior.
 *
 * Uses an isolated ALLOY_RUNTIME_ROOT seeded from the live Access mission
 * assignment store so verification has real evidence without polluting other
 * missions' conversation threads beyond the seeded mission id.
 */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  cpSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { createHash, randomBytes } from "node:crypto";

const LIVE_ROOT = join(os.homedir(), ".local", "state", "alloy-dev");
const MID = "msn_2d054741a54698fa4c";
const AID = "asg_d203f547736c16";
const OTHER_MID = "msn_feedback_loop_other_" + randomBytes(4).toString("hex");

const root = mkdtempSync(join(os.tmpdir(), "vac-dfl-cert-"));
process.env.ALLOY_RUNTIME_ROOT = root;
process.env.VACILANDO_API_TOKEN = "test-token-dfl-cert-" + randomBytes(4).toString("hex");
process.env.VACILANDO_REQUIRE_API_AUTH = "1";

function seedFromLive() {
  const pairs = [
    ["vacilando/assignments", `${MID}.json`],
    ["vacilando/evidence", `${MID}.json`],
    ["vacilando/deliverable-reviews", `${MID}.json`],
  ];
  for (const [dir, file] of pairs) {
    const src = join(LIVE_ROOT, dir, file);
    const destDir = join(root, dir);
    mkdirSync(destDir, { recursive: true });
    if (existsSync(src)) {
      cpSync(src, join(destDir, file));
    }
  }
  // Empty message / timeline / idempotency for clean conversation proof
  mkdirSync(join(root, "vacilando", "director-messages"), { recursive: true });
  mkdirSync(join(root, "vacilando", "timeline"), { recursive: true });
  mkdirSync(join(root, "vacilando", "director-idempotency"), { recursive: true });
  writeFileSync(join(root, "vacilando", "director-messages", `${MID}.jsonl`), "");
  writeFileSync(join(root, "vacilando", "director-messages", `${OTHER_MID}.jsonl`), "");
}

seedFromLive();

const {
  createDeliverableReview,
  shareContextWithDirector,
  requestDeliverableChanges,
  recheckDeliverableReview,
  acceptDeliverableReview,
  listDeliverableConversation,
  deliverableReviewVm,
  supersedeOpenReviewsForAssignment,
  getDeliverableReview,
  RECHECK_SEMANTICS,
  CERTIFY_NOTE_SEMANTICS,
} = await import("../lib/vacilando/deliverable-review.mjs");

const { listDirectorMessages } = await import("../lib/vacilando/director-comms.mjs");
const { serializeAssignmentPrompt, getAssignment } = await import("../lib/vacilando/worker-assignment.mjs");
const { handleV2Post, handleV2Get } = await import("../lib/vacilando/v2-api.mjs");
const { apiAuthRequired, getVacilandoApiToken } = await import("../lib/vacilando/vacilando-api-auth.mjs");

assert.equal(apiAuthRequired(), true);
const TOKEN = getVacilandoApiToken();
assert.ok(TOKEN);

const authHeaders = { authorization: `Bearer ${TOKEN}` };
const badHeaders = { authorization: "Bearer wrong-token" };

// --- Create open review ---
supersedeOpenReviewsForAssignment(MID, AID, { reason: "dfl_cert_setup" });
const created = createDeliverableReview(MID, AID, { force: true, autoRepair: false });
assert.ok(created.ok, "create review");
const reviewId = created.review.review_id;
assert.ok(
  ["ready_for_review", "cannot_verify", "evidence_discrepancy"].includes(created.review.certification_state),
  `open review state=${created.review.certification_state}`,
);

const CONTEXT_PHRASE = `ALIGN-${randomBytes(3).toString("hex")}: prefer wave order A before B; residual docs risk accepted.`;

// ========== 1 + 2 + 3: share context → Director input → response ==========
const shared = shareContextWithDirector(MID, reviewId, {
  message: CONTEXT_PHRASE,
  actor: "operator",
  idempotencyKey: "share-1",
});
assert.ok(shared.ok, "share context");
assert.ok(shared.directorInput, "Director input present");
assert.equal(shared.directorInput.missionId, MID);
assert.equal(shared.directorInput.reviewId, reviewId);
assert.ok(
  shared.directorInput.operatorContext.some((c) => String(c.verbatim).includes(CONTEXT_PHRASE)),
  "Director input includes shared context",
);
assert.ok(
  shared.directorInput.conversation.some((t) => t.actor === "you" && t.text.includes(CONTEXT_PHRASE)),
  "conversation in input includes operator text",
);
assert.ok(shared.directorResponse?.incorporatedOperatorExcerpt?.includes("ALIGN-"), "Director response quotes context");
assert.match(shared.directorResponse.summary, /Incorporating your context/i);

const msgs = listDirectorMessages(MID, { limit: 50 });
const opMsg = msgs.find((m) => m.reviewId === reviewId && m.kind === "context");
assert.ok(opMsg, "operator message stored with reviewId");
assert.equal(opMsg.missionId, MID);
const dirMsg = msgs.find((m) => m.reviewId === reviewId && m.kind === "director_response");
assert.ok(dirMsg, "Director response message persisted");
assert.match(dirMsg.verbatim || dirMsg.interpretation?.summary || "", /ALIGN-/);

const thread = listDeliverableConversation(MID, { reviewId, limit: 12 });
assert.ok(thread.length >= 2, "thread has operator + director");
const youIdx = thread.findIndex((t) => t.actor === "you" && t.text.includes("ALIGN-"));
const dirIdx = thread.findIndex((t) => t.actor === "director" && /ALIGN-|Incorporating/i.test(t.text));
assert.ok(youIdx >= 0 && dirIdx > youIdx, "ordered conversation: you then director");

const vm = deliverableReviewVm(MID, created.review);
assert.ok(Array.isArray(vm.conversation));
assert.ok(vm.conversation.some((t) => t.actor === "you" && t.text.includes("ALIGN-")));
assert.ok(vm.conversation.some((t) => t.actor === "director"));

// ========== 8: retry / idempotency ==========
const beforeCount = listDirectorMessages(MID, { limit: 200 }).length;
const sharedRetry = shareContextWithDirector(MID, reviewId, {
  message: CONTEXT_PHRASE,
  actor: "operator",
  idempotencyKey: "share-1",
});
assert.ok(sharedRetry.ok);
assert.equal(sharedRetry.deduped, true, "retry dedupes operator message");
const afterCount = listDirectorMessages(MID, { limit: 200 }).length;
assert.equal(afterCount, beforeCount, "retry does not append duplicate messages");

// ========== 5: recheck uses conversation + evidence (before request-changes clears completion) ==========
assert.equal(RECHECK_SEMANTICS.usesConversationThread, true);
assert.equal(RECHECK_SEMANTICS.usesCurrentEvidence, true);

const RECHECK_CTX = CONTEXT_PHRASE; // already shared on reviewId
const rechecked = recheckDeliverableReview(MID, reviewId, { actor: "operator" });
assert.ok(rechecked.ok, "recheck");
assert.equal(rechecked.recheckSemantics.usesConversationThread, true);
assert.equal(rechecked.recheckSemantics.usesCurrentEvidence, true);
assert.ok(rechecked.directorInput, "recheck Director input");
assert.ok(Array.isArray(rechecked.directorInput.evidenceSummary), "recheck includes evidence summary");
assert.ok(
  /Re-checked|evidence plus the conversation/i.test(rechecked.directorTurn.response.summary),
  "recheck response cites evidence+conversation semantics",
);
assert.ok(
  (rechecked.directorTurn.response.incorporatedOperatorExcerpt || "").includes("ALIGN-")
    || (rechecked.directorInput.conversation || []).some((t) => (t.text || "").includes("ALIGN-")),
  "recheck incorporates prior shared context",
);
const ridAfterRecheck = rechecked.review.review_id;

// ========== 6: isolation across review / mission ==========
const otherReview = createDeliverableReview(MID, AID, { force: true, autoRepair: false });
assert.ok(otherReview.ok, JSON.stringify(otherReview));
const ridOther = otherReview.review.review_id;
shareContextWithDirector(MID, ridOther, {
  message: `OTHER-REVIEW-${randomBytes(2).toString("hex")}`,
  idempotencyKey: "other-rev",
});
const threadA = listDeliverableConversation(MID, { reviewId: ridAfterRecheck, limit: 20 });
const threadB = listDeliverableConversation(MID, { reviewId: ridOther, limit: 20 });
assert.ok(!threadA.some((t) => /OTHER-REVIEW-/.test(t.text)), "no cross-review leak into prior review thread");
assert.ok(threadB.some((t) => /OTHER-REVIEW-/.test(t.text)), "other review has its own message");

const badShare = shareContextWithDirector(MID, "drev_does_not_exist", { message: "nope" });
assert.equal(badShare.ok, false);
assert.equal(badShare.error, "review_not_found");

const { submitOperatorDirectorMessage } = await import("../lib/vacilando/director-comms.mjs");
submitOperatorDirectorMessage({
  missionId: OTHER_MID,
  reviewId: "drev_foreign",
  kind: "context",
  message: "Operator context: FOREIGN-MISSION-SECRET",
  skipSideEffects: true,
});
const midThread = listDeliverableConversation(MID, { reviewId: ridOther, limit: 50 });
assert.ok(!midThread.some((t) => /FOREIGN-MISSION-SECRET/.test(t.text)), "no cross-mission leak");

const session = await handleV2Get("/api/v2/session", new URL("http://127.0.0.1/api/v2/session"));
assert.equal(session.body.isolation.organizations.startsWith("n/a"), true);

// ========== 7: API authorization ==========
const unauth = await handleV2Post("/api/v2/deliverable-reviews/share-context", {
  mission_id: MID,
  review_id: ridOther,
  message: "should fail",
}, { headers: badHeaders });
assert.equal(unauth.status, 401);
assert.equal(unauth.body.error, "unauthorized");

const unauthGet = await handleV2Get(
  "/api/v2/deliverable-reviews",
  new URL(`http://127.0.0.1/api/v2/deliverable-reviews?mission_id=${MID}`),
  { headers: badHeaders },
);
assert.equal(unauthGet.status, 401);

const authShare = await handleV2Post("/api/v2/deliverable-reviews/share-context", {
  mission_id: MID,
  review_id: ridOther,
  message: `API-AUTH-OK-${randomBytes(2).toString("hex")}`,
  idempotency_key: "api-share-1",
}, { headers: authHeaders });
assert.equal(authShare.status, 200);
assert.ok(authShare.body.ok);
assert.ok(authShare.body.directorInput || authShare.body.directorTurn);

// ========== 10: certify note trigger behavior ==========
assert.equal(CERTIFY_NOTE_SEMANTICS.emptyNote, "records_only");
assert.equal(CERTIFY_NOTE_SEMANTICS.withNote, "records_and_director_message");

function forceApprovable(rid) {
  const path = join(root, "vacilando", "deliverable-reviews", `${MID}.json`);
  const store = JSON.parse(readFileSync(path, "utf8"));
  const r = store.reviews.find((x) => x.review_id === rid);
  assert.ok(r, "review for forceApprovable");
  r.certification_state = "ready_for_review";
  r.recommendation = "approve";
  r.evidence_reconciliation = { ...(r.evidence_reconciliation || {}), reconciliation_state: "consistent", blocking_discrepancies: [] };
  writeFileSync(path, JSON.stringify(store, null, 2));
  return getDeliverableReview(MID, rid);
}

const rid4 = ridOther;
forceApprovable(rid4);
const beforeCertMsgs = listDirectorMessages(MID, { limit: 200 })
  .filter((m) => m.reviewId === rid4).length;
const emptyCert = acceptDeliverableReview(MID, rid4, { response: null });
assert.ok(emptyCert.ok, JSON.stringify(emptyCert));
assert.equal(emptyCert.review.acceptance_note, null);
const afterEmpty = listDirectorMessages(MID, { limit: 200 })
  .filter((m) => m.reviewId === rid4).length;
assert.equal(afterEmpty, beforeCertMsgs, "empty note does not message Director");

const created5 = createDeliverableReview(MID, AID, { force: true, autoRepair: false });
assert.ok(created5.ok, JSON.stringify(created5));
const rid5 = created5.review.review_id;
forceApprovable(rid5);
const NOTE = `CERT-NOTE-${randomBytes(3).toString("hex")}: accept residual risk`;
const withNote = acceptDeliverableReview(MID, rid5, { response: NOTE });
assert.ok(withNote.ok, JSON.stringify(withNote));
assert.equal(withNote.review.acceptance_note, NOTE);
const noteMsgs = listDirectorMessages(MID, { limit: 200 })
  .filter((m) => m.reviewId === rid5);
assert.ok(noteMsgs.some((m) => m.kind === "context" && String(m.verbatim).includes(NOTE)));
assert.ok(noteMsgs.some((m) => m.kind === "director_response" && /CERT-NOTE-|certification note/i.test(m.verbatim || m.interpretation?.summary || "")));

// ========== 4: request changes (last — clears completion report) ==========
const created2 = createDeliverableReview(MID, AID, { force: true, autoRepair: false });
assert.ok(created2.ok, JSON.stringify(created2));
const rid2 = created2.review.review_id;
const CHANGE_PHRASE = `REWORK-${randomBytes(3).toString("hex")}: tighten evidence narrative for principal check.`;
const changed = requestDeliverableChanges(MID, rid2, {
  direction: CHANGE_PHRASE,
  actor: "operator",
  idempotencyKey: "chg-1",
});
assert.ok(changed.ok, "request changes");
assert.ok(changed.directorInput, "Director input on request-changes");
assert.ok(
  String(changed.directorInput.operatorVerbatim || "").includes("REWORK-")
    || changed.directorInput.conversation.some((t) => t.text.includes("REWORK-")),
  "change reason in Director input",
);
assert.match(changed.directorTurn.response.summary, /requested changes/i);
assert.match(changed.directorTurn.response.summary, /REWORK-/);

const asg = getAssignment(MID, AID);
assert.equal(asg.reopen_reason, CHANGE_PHRASE);
const prompt = serializeAssignmentPrompt(asg, { globalConstraints: [] });
assert.match(prompt, /Operator change request/);
assert.match(prompt, /REWORK-/);

// ========== 9: restart persistence ==========
const persistPath = join(root, "vacilando", "director-messages", `${MID}.jsonl`);
assert.ok(existsSync(persistPath));
const disk = readFileSync(persistPath, "utf8");
assert.match(disk, /ALIGN-/);
assert.match(disk, /director_response|Incorporating your context/);
// Simulate control-plane restart: clear module-level nothing — re-read via API
const { listDirectorMessages: listAfterRestart } = await import("../lib/vacilando/director-comms.mjs");
const afterRestart = listAfterRestart(MID, { limit: 200 });
assert.ok(afterRestart.some((m) => String(m.verbatim || "").includes("ALIGN-")));

// Evidence artifact for the operator report
const evidence = {
  ok: true,
  runtimeRoot: root,
  missionId: MID,
  reviewId,
  directorInput: shared.directorInput,
  directorResponse: shared.directorResponse,
  conversation: listDeliverableConversation(MID, { reviewId, limit: 12 }),
  recheckSemantics: RECHECK_SEMANTICS,
  certifyNoteSemantics: CERTIFY_NOTE_SEMANTICS,
  auth: { required: true, unauthorizedRejected: true },
};

const outPath = join(root, "feedback-loop-cert-evidence.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));

// Cleanup open ready rows for this assignment in the isolated store only
supersedeOpenReviewsForAssignment(MID, AID, { reason: "dfl_cert_teardown" });

console.log(JSON.stringify({
  ok: true,
  evidencePath: outPath,
  directorInputTrigger: shared.directorInput.trigger,
  directorResponseExcerpt: shared.directorResponse.incorporatedOperatorExcerpt,
  conversationLen: evidence.conversation.length,
  recheckUsesBoth: RECHECK_SEMANTICS.usesConversationThread && RECHECK_SEMANTICS.usesCurrentEvidence,
  certifyWithNoteMessagesDirector: CERTIFY_NOTE_SEMANTICS.withNote,
  authorizeUnauthorized: unauth.status,
}, null, 2));
