import { FACTS } from './inventory.mjs';
const isRealDest = (d) => !/body$|^handbook:/.test(d);
const rawOf = (f) => {
  const real = f.dest.filter(isRealDest);
  if (f.id.startsWith('imm.') && f.repeats) return f.repeats * (f.parts ?? 1);
  return real.length;
};
let cis=0, fs=0;
for (const f of FACTS) {
  const real = f.dest.filter(isRealDest);
  const nC = real.filter(d=>d.startsWith('cis:')).length;
  const nF = real.filter(d=>d.startsWith('fs:')).length;
  if (f.id.startsWith('imm.') && f.repeats) { cis += f.repeats*(f.parts??1); continue; }
  cis += nC; fs += nF;
}
console.log('CIS destinations accounted:', cis, '(measured AcroForm: 85)');
console.log('Formsite destinations accounted:', fs, '(measured HTML controls 94 + 3 signature canvases = 97)');
console.log('TOTAL raw destinations:', cis+fs, '(measured: 182)');
const ackOnly = FACTS.filter(f=>f.ack).length;
console.log('acknowledgement clauses (prose, no separate destination):', ackOnly);
