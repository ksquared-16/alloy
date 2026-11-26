import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { writeFileSync } from "node:fs";
const doc = await PDFDocument.create();
const page = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
const form = doc.getForm();
const labels = ["Child Name", "Parent/Guardian Name", "Parent/Guardian Phone", "Emergency Contact Name", "Emergency Contact Phone",
  "Emergency Contact Relationship to Child", "Physician Name", "Phone", "Email"];
page.drawText("ZZQA1492 One-Section Intake", { x: 50, y: 750, size: 16, font });
labels.forEach((l, i) => {
  const y = 700 - i * 55;
  page.drawText(l, { x: 50, y: y + 20, size: 10, font });
  const f = form.createTextField(l);
  f.addToPage(page, { x: 50, y, width: 300, height: 18 });
  f.acroField.dict.set(PDFName.of("TU"), PDFString.of(l));
});
writeFileSync(new URL("./one-section-acroform.pdf", import.meta.url), await doc.save());
console.log("ok");
