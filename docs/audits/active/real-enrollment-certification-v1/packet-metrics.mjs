import { FACTS } from './inventory.mjs';
const isRealDest = (d) => !/body$|^handbook:/.test(d);
const rawOf = (f) => (f.id.startsWith('imm.') && f.repeats) ? f.repeats*(f.parts??1) : f.dest.filter(isRealDest).length;

const SECTION = (f) => {
  const id = f.id;
  if (f.ack || f.signature) return '10 · Review & sign';
  if (id.startsWith('imm.')) return '05 · Immunization record';
  if (id.startsWith('bank.') || id.startsWith('account_holder')) return '09 · Tuition & payment';
  if (id.startsWith('ec')) return '03 · Emergency contacts & authorized adults';
  if (/custody|restraining/.test(id)) return '08 · Custody & legal';
  if (id.startsWith('guardian') || /household\.(primary|secondary)_address|pickup_notes/.test(id)) return '02 · Family & contact information';
  if (/physician|dentist|allergies|medications|general_health|birth_complications|serious_illness|insect_sting|accommodations|developmental_history|therapy_history|sibling/.test(id)) return '04 · Health & medical';
  if (/eating|diet|foods|toilet|nap|bedtime|wake_time/.test(id)) return '06 · Daily routines';
  if (/social|prior_care|concurrent|strangers|plays_alone|favorite_activities|fears|comfort|anger|behavior_management|personality|enrollment_goals|additional_notes/.test(id)) return '07 · Getting to know your child';
  if (id.startsWith('org.')||id.startsWith('sys.')) return '00 · Org / system supplied';
  return '01 · About your child';
};

const RAW = FACTS.reduce((a,f)=>a+rawOf(f),0);
const parent = FACTS.filter(f=>f.ask==='confirm'||f.ask==='collect');
const confirm = parent.filter(f=>f.ask==='confirm');
const collect = parent.filter(f=>f.ask==='collect');
const gated   = parent.filter(f=>f.conditional);
const always  = parent.filter(f=>!f.conditional);

console.log('══ PACKET BASELINE ══════════════════════════════════════════');
console.log('documents                                    3  (2 PDF + 1 hosted HTML form)');
console.log('pages                                       30  (23 handbook + 4 CIS + 3 form screens)');
console.log('raw fillable/write-in destinations          ' + RAW);
console.log('unique semantic facts                       ' + FACTS.length);
console.log('repeated semantic facts (>1 destination)    ' + FACTS.filter(f=>rawOf(f)>1).length);
console.log('facts already canonical in Alloy            ' + FACTS.filter(f=>f.canon==='yes').length + '  (+' + FACTS.filter(f=>f.canon==='composite').length + ' canonical-composite)');
console.log('facts with NO canonical binding             ' + FACTS.filter(f=>f.canon==='no').length);
console.log('conditional questions                       ' + gated.length + '  (behind ' + FACTS.filter(f=>f.gate).length + ' gate questions)');
console.log('acknowledgements                            ' + FACTS.filter(f=>f.ack).length);
console.log('signatures                                  ' + FACTS.filter(f=>f.signature).length);
console.log('document uploads / evidence requests        ' + FACTS.filter(f=>f.upload).length);
const g = {}; for (const f of FACTS) g[f.grain]=(g[f.grain]??0)+1;
console.log('participant/child grain                     ' + g.child);
console.log('household grain                             ' + (g.household + g.guardian1 + g.guardian2 + g.ec1 + g.ec2 + g.ec3 + g.account_holder) + '  (household ' + g.household + ', guardians ' + (g.guardian1+g.guardian2) + ', emergency contacts ' + (g.ec1+g.ec2+g.ec3) + ', account holder ' + g.account_holder + ')');
console.log('recipient/signer grain                      ' + g.recipient);
console.log('org/system supplied                         ' + (g.org+g.system));

console.log('\n══ COMPRESSION ══════════════════════════════════════════════');
const step = (label, v, base) => console.log('  ' + label.padEnd(42) + String(v).padStart(4) + (base ? '   (' + Math.round((1-v/base)*100) + '% below raw)' : ''));
step('raw destinations', RAW);
step('unique semantic needs', FACTS.length, RAW);
step('parent-supplied needs', parent.length, RAW);
step('· already known → confirm once', confirm.length);
step('· genuinely missing → collect', collect.length);
step('needs asked unconditionally', always.length, RAW);
step('needs behind a gate (typical parent: 0-2)', gated.length);
step('artifact-specific signatures', FACTS.filter(f=>f.signature).length);
step('acknowledgement decisions', FACTS.filter(f=>f.ack).length);

console.log('\n══ SECTION CLUSTERING (deterministic needs) ═════════════════');
const bySec = {};
for (const f of FACTS) { const s = SECTION(f); (bySec[s] ??= []).push(f); }
for (const s of Object.keys(bySec).sort()) {
  const list = bySec[s];
  const p = list.filter(f=>f.ask==='confirm'||f.ask==='collect');
  console.log('  ' + s.padEnd(46) + 'needs ' + String(p.length).padStart(3) + '   destinations ' + String(list.reduce((a,f)=>a+rawOf(f),0)).padStart(3));
}
