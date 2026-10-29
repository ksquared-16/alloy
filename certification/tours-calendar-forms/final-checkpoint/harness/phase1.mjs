import { familyRequest, loadState, saveState } from "./fam.mjs";
const s = loadState(); s.p1 = s.p1 ?? {};
const run = async (k, a) => { try { s.p1[k] = await familyRequest(a); } catch (e) { s.p1[k] = { tag: a.tag, error: String(e).slice(0, 300) }; } saveState(s); console.log(k, JSON.stringify(s.p1[k])); };
await run("A", { tag: "a-desktop-standalone", dayRe: /November 3\b/, time: "10:00 AM", first: "Jamie", last: "Finalqa", email: "qa+final-a@example.invalid", consent: { email: true } });
await run("B", { tag: "b-mobile-iframe", dayRe: /November 4\b/, time: "2:00 PM", first: "Riley", last: "Pendingqa", email: "qa+final-b@example.invalid", consent: {}, mobile: true, iframe: true });
await run("C", { tag: "c-desktop-iframe", dayRe: /November 5\b/, time: "11:00 AM", first: "Casey", last: "Seatoneqa", email: "qa+final-c@example.invalid", consent: { sms: true }, iframe: true });
await run("D", { tag: "d-mobile-standalone", dayRe: /November 5\b/, time: "11:00 AM", first: "Drew", last: "Seattwoqa", email: "qa+final-d@example.invalid", consent: {}, mobile: true });
await run("E", { tag: "e-desktop-standalone", dayRe: /November 5\b/, time: "11:00 AM", first: "Emery", last: "Overflowqa", email: "qa+final-e@example.invalid", consent: {} });
