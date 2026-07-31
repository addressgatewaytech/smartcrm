// Onboarding (company-formation data collection) form — branded, print-and-sign PDF. Reuses the
// same brand header/fonts as every other document PDF in this app (pdfCommon.js) for consistency,
// but is laid out as its own document: numbered sections with a teal accent bar, bordered partner
// cards, a banded visa table, and a closing Declaration & Signature block for physical signing.
const path = require("path");
const PDFDocument = require("pdfkit");
const { MARGIN, GRAY, INK, HAIR, registerFonts, fmtDate } = require("./pdfCommon");

const ACCENT = "#0D7288"; // same "Teal Classic" accent used elsewhere in the app's PDFs
const ACCENT_TINT = "#E1F2F5";
const DARK_BADGE = "#1B2028";

const LOGO_PATH = path.join(__dirname, "../../frontend/public/logo-address-gateway.png");
const LOGO_ASPECT = 1410 / 613;
const SMARTCRM_LOGO_PATH = path.join(__dirname, "../../frontend/public/logo-smart-crm.png");
const SMARTCRM_ASPECT = 294 / 157;

const DISCLAIMER = "This document is issued solely for company-onboarding / data-collection purposes and carries no legal or financial effect on its own.";

/** Address Gateway wordmark + address, right-aligned — same block used on every other PDF. */
function drawBrandHeader(doc, rightX, y) {
  const logoHeight = 30;
  const logoWidth = logoHeight * LOGO_ASPECT;
  doc.image(LOGO_PATH, rightX - logoWidth, y, { height: logoHeight });
  let ty = y + logoHeight + 5;
  doc.font("Inter").fontSize(8).fillColor(GRAY)
    .text("Address Gateway Building, D Ring Road, Doha, Qatar", MARGIN, ty, { width: rightX - MARGIN, align: "right" });
  ty = doc.y;
  doc.text("Call: 44434912 · startup@addressgateway.com · www.addressgateway.com", MARGIN, ty, { width: rightX - MARGIN, align: "right" });
  doc.fillColor(INK);
  return doc.y;
}

/** "Powered by Smart CRM" badge, top-left — a dark pill since the Smart CRM mark itself is white. */
function drawPoweredByBadge(doc, x, y) {
  doc.font("Inter").fontSize(7).fillColor(GRAY).text("POWERED BY", x, y, { characterSpacing: 0.6 });
  const badgeY = doc.y + 3;
  const badgeH = 22;
  const logoH = 13;
  const logoW = logoH * SMARTCRM_ASPECT;
  const badgeW = logoW + 20;
  doc.roundedRect(x, badgeY, badgeW, badgeH, 5).fill(DARK_BADGE);
  doc.image(SMARTCRM_LOGO_PATH, x + 10, badgeY + (badgeH - logoH) / 2, { height: logoH });
  doc.fillColor(INK);
  return badgeY + badgeH;
}

/** Numbered section heading with a teal left accent bar. Returns the y after it. */
function sectionHeading(doc, number, title, x, y, width) {
  doc.rect(x, y, 3, 16).fill(ACCENT);
  doc.font("Inter-Bold").fontSize(11).fillColor(INK).text(`${number}  ${title.toUpperCase()}`, x + 10, y + 1, { width: width - 10, characterSpacing: 0.3 });
  doc.fillColor(INK);
  return doc.y + 8;
}

/**
 * @param {object} form - onboarding_forms row (snake_case) plus items already parsed from JSON
 * @param {string} customerName
 * @param {import('express').Response} res
 */
function generateOnboardingFormPdf(form, customerName, res) {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Onboarding-${form.id}.pdf"`);
  doc.pipe(res);

  const right = doc.page.width - MARGIN;
  const width = right - MARGIN;
  let y = MARGIN;

  drawPoweredByBadge(doc, MARGIN, y);
  const headerBottom = drawBrandHeader(doc, right, y);
  y = Math.max(doc.y, headerBottom) + 14;

  doc.moveTo(MARGIN, y).lineTo(right, y).strokeColor(ACCENT).lineWidth(2).stroke();
  y += 14;

  doc.font("Inter-Bold").fontSize(19).fillColor(INK).text("COMPANY FORMATION", MARGIN, y);
  y = doc.y;
  doc.font("Inter-Bold").fontSize(19).fillColor(ACCENT).text("DATA COLLECTION FORM", MARGIN, y);
  y = doc.y + 6;
  doc.font("Inter").fontSize(9).fillColor(GRAY).text(DISCLAIMER, MARGIN, y, { width });
  y = doc.y + 12;

  // Customer / form meta strip
  doc.rect(MARGIN, y, width, 34).fill(ACCENT_TINT);
  doc.font("Inter-SemiBold").fontSize(11).fillColor(INK).text(customerName || "", MARGIN + 10, y + 6, { width: width / 2 });
  doc.font("Inter").fontSize(8).fillColor(GRAY)
    .text(`Form ID: ${form.id}`, MARGIN + width / 2, y + 6, { width: width / 2 - 10, align: "right" });
  doc.text(`Status: ${form.status}   ·   Created: ${fmtDate(form.created_at)}`, MARGIN + width / 2, y + 19, { width: width / 2 - 10, align: "right" });
  doc.fillColor(INK);
  y += 46;

  const ensureRoom = (needed) => {
    if (y + needed > doc.page.height - MARGIN - 30) { doc.addPage(); y = MARGIN; }
  };

  // 01 — Preferred company names
  y = sectionHeading(doc, "01", "Preferred Company Names", MARGIN, y, width);
  const names = form.company_names_en || [];
  const namesAr = form.company_names_ar || [];
  const colW = width / 2 - 10;
  names.forEach((en, i) => {
    const ar = namesAr[i] || "";
    if (!en && !ar) return;
    ensureRoom(16);
    const enHeight = doc.font("Inter").fontSize(9.5).heightOfString(en || "—", { width: colW - 18 });
    doc.font("Inter-SemiBold").fontSize(9).fillColor(GRAY).text(`${String.fromCharCode(65 + i)}.`, MARGIN, y, { width: 18, lineBreak: false });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(en || "—", MARGIN + 18, y, { width: colW - 18 });
    if (ar) doc.font("Inter").fontSize(9.5).fillColor(INK).text(ar, MARGIN + colW + 20, y, { width: colW, align: "right" });
    y += Math.max(14, enHeight) + 5;
  });
  y += 8;

  // 02 — Activities
  const activities = (form.activities || []).filter((a) => a.en || a.ar || a.number);
  if (activities.length) {
    ensureRoom(24);
    y = sectionHeading(doc, "02", "Business Activities", MARGIN, y, width);
    activities.forEach((a, i) => {
      ensureRoom(16);
      doc.font("Inter").fontSize(9.5).fillColor(INK).text(`${i + 1}. ${a.en || "—"}${a.number ? `  (No. ${a.number})` : ""}`, MARGIN, y, { width });
      y = doc.y + 4;
    });
    y += 8;
  }

  // 03 — Capital & legal status
  ensureRoom(30);
  y = sectionHeading(doc, "03", "Capital & Legal Status", MARGIN, y, width);
  doc.font("Inter-SemiBold").fontSize(9).fillColor(GRAY).text("Capital amount (QAR)", MARGIN, y, { continued: true, width: 160 });
  doc.font("Inter").fontSize(9.5).fillColor(INK).text(`  ${form.capital_amount != null ? Number(form.capital_amount).toLocaleString() : "—"}`);
  y = doc.y + 4;
  doc.font("Inter-SemiBold").fontSize(9).fillColor(GRAY).text("Legal status", MARGIN, y, { continued: true, width: 160 });
  doc.font("Inter").fontSize(9.5).fillColor(INK).text(`  ${form.legal_status || "WLL"}`);
  y = doc.y + 12;

  // 04 — Partners
  const partners = (form.partners || []).filter((p) => p.name);
  if (partners.length) {
    ensureRoom(24);
    y = sectionHeading(doc, "04", "Partners — Shares & Contact Details", MARGIN, y, width);
    partners.forEach((p, i) => {
      const cardH = 78;
      ensureRoom(cardH + 8);
      doc.roundedRect(MARGIN, y, width, cardH, 4).fillAndStroke("#FAFBFB", HAIR);
      const px = MARGIN + 12;
      doc.font("Inter-SemiBold").fontSize(9.5).fillColor(ACCENT).text(`Partner ${i + 1} — ${p.name}`, px, y + 10, { width: width - 24 });
      const row1 = y + 28;
      const colWidth = (width - 24) / 3;
      doc.font("Inter").fontSize(8.5).fillColor(GRAY).text(`ID/QID/Passport: ${p.idNumber || "—"}`, px, row1, { width: colWidth });
      doc.text(`Nationality: ${p.nationality || "—"}`, px + colWidth, row1, { width: colWidth });
      doc.text(`Share: ${p.sharePercent != null && p.sharePercent !== "" ? p.sharePercent + "%" : "—"}`, px + colWidth * 2, row1, { width: colWidth });
      const row2 = row1 + 16;
      doc.text(`Mobile: ${p.mobile || "—"}`, px, row2, { width: colWidth });
      doc.text(`Email: ${p.email || "—"}`, px + colWidth, row2, { width: colWidth * 2 });
      const row3 = row2 + 16;
      doc.text(`P.O. Box: ${p.poBox || "—"}`, px, row3, { width: colWidth });
      doc.text(`Signature authority: ${p.signatureAuthority ? "Yes" : "No"}`, px + colWidth, row3, { width: colWidth * 2 });
      doc.fillColor(INK);
      y += cardH + 8;
    });
    y += 4;
  }

  // 05 — Visa details
  const visas = (form.visas || []).filter((v) => v.nationality || v.qty || v.occupation);
  if (visas.length) {
    ensureRoom(40);
    y = sectionHeading(doc, "05", "Visa Details", MARGIN, y, width);
    const vCol = { letter: MARGIN, nat: MARGIN + 24, qty: MARGIN + 220, occ: MARGIN + 270, gender: MARGIN + 430 };
    doc.rect(MARGIN, y, width, 18).fill(INK);
    doc.font("Inter-SemiBold").fontSize(8).fillColor("#FFFFFF");
    doc.text("#", vCol.letter + 5, y + 5);
    doc.text("Nationality", vCol.nat, y + 5);
    doc.text("Qty", vCol.qty, y + 5);
    doc.text("Occupation", vCol.occ, y + 5);
    doc.text("Gender", vCol.gender, y + 5);
    doc.fillColor(INK);
    y += 18;
    visas.forEach((v, i) => {
      ensureRoom(16);
      if (i % 2 === 1) doc.rect(MARGIN, y, width, 16).fill("#F5F6F6");
      doc.fillColor(INK).font("Inter").fontSize(8.5);
      doc.text(String.fromCharCode(65 + i), vCol.letter + 5, y + 4);
      doc.text(v.nationality || "—", vCol.nat, y + 4, { width: vCol.qty - vCol.nat - 5 });
      doc.text(String(v.qty ?? "—"), vCol.qty, y + 4);
      doc.text(v.occupation || "—", vCol.occ, y + 4, { width: vCol.gender - vCol.occ - 5 });
      doc.text(v.gender || "—", vCol.gender, y + 4);
      y += 16;
    });
    y += 12;
  }

  // Declaration & signature
  ensureRoom(120);
  y = sectionHeading(doc, "06", "Declaration & Signature", MARGIN, y, width);
  doc.font("Inter").fontSize(9).fillColor(INK).text(
    "I/We confirm that the information provided in this form is true, complete and accurate to the best of my/our knowledge, and authorize Address Gateway Business Services to proceed with the company formation process on this basis.",
    MARGIN, y, { width }
  );
  y = doc.y + 36;

  const sigColW = (width - 30) / 2;
  const drawSignatureLine = (label, sx) => {
    doc.moveTo(sx, y).lineTo(sx + sigColW, y).strokeColor(HAIR).lineWidth(1).stroke();
    doc.font("Inter-SemiBold").fontSize(9).fillColor(INK).text(label, sx, y + 6, { width: sigColW });
    doc.font("Inter").fontSize(8).fillColor(GRAY).text("Date: ____________________", sx, y + 22, { width: sigColW });
  };
  drawSignatureLine("Client Signature", MARGIN);
  drawSignatureLine("Address Gateway Representative", MARGIN + sigColW + 30);
  doc.fillColor(INK);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Inter").fontSize(7).fillColor(GRAY)
      .text(`${DISCLAIMER}  ·  Page ${i - range.start + 1} of ${range.count}`, MARGIN, doc.page.height - MARGIN - 14, { width: doc.page.width - MARGIN * 2, align: "center" });
  }

  doc.end();
}

module.exports = { generateOnboardingFormPdf };
