// Server-side A4 PDF generation for quotations (PDFKit — no headless browser needed, which
// keeps this friendly to Hostinger shared hosting). Mirrors the original Address Gateway
// quotation format (see AGBSQ000752.pdf reference) — same Inter font, same header layout,
// same dark table header, Bank Account Details, disclaimer and Acceptance Form.
const path = require("path");
const PDFDocument = require("pdfkit");
const { quoteTotal } = require("./helpers");

const DEFAULT_BANK = [
  "ADDRESS GATEWAY BUSINESS SERVICES",
  "Bank: Commercial Bank",
  "Account Number: 4680-21670035-001",
  "IBAN: QA14CBQA00000468021670035001",
  "Company Fawran: ER-17274261",
  "Doha, Qatar",
].join("\n");

const DEFAULT_FOOTER_NOTE =
  "This quotation is provided for estimation purposes only and does not constitute legal or " +
  "financial advice; signature is not required.";

const DISCLAIMER_1 =
  "Disclaimer: Based on actuals. Rates might change anytime. If everything is clear and satisfactory, please feel free to sign the " +
  "acceptance part below so we can immediately start the process. We look forward to assisting you with utmost professionalism as we " +
  "envision a long-term working relationship with you and your company.";
const DISCLAIMER_2 =
  "Ministry fees are subject to change and may vary depending on the time of submission and the applicable government rules and " +
  "regulations in effect at that time. Approval timelines, including company formation and visa approval, are also dependent on the " +
  "decisions and processing timeframes of the relevant government authorities.";

// IDs are always "AGBS" + a 2-letter entity code + a sequential number (see nextSequentialId in
// helpers.js) — AGBSQS10220 splits into AGBS/QS/10220. Falls back to the raw id for anything that
// doesn't match (should never happen given the ID generator, but a display glitch beats a crash).
const formatQuoteNumber = (id) => {
  const m = /^([A-Z]{4})([A-Z]{2})(\d+)$/.exec(id || "");
  return m ? `${m[1]}/${m[2]}/${m[3]}` : id;
};

const MARGIN = 40;
const GRAY = "#6b7178";
const INK = "#151A1F";
const DARK_BG = "#2A2E33";
const HAIR = "#E1E6E8";
const LIGHT_BG = "#F5F6F6";
// Light background bands so a Government Fee section and a Professional Fee section are visually
// obvious at a glance — must match the hex values in App.jsx's GOV_FEE_BG/PROF_FEE_BG exactly, so
// the PDF preview ("exactly what the client receives") isn't lying about what the client gets.
const GOV_FEE_BG = "#E7F0FB";
const PROF_FEE_BG = "#EAF7EF";

// Quotation color themes — selectable per quotation (quotations.theme). Each controls the table
// header band, the shaded Total row, and the section headings (Terms & Conditions, Bank Account
// Details, Acceptance Form) that follow the item table.
const THEMES = {
  charcoal: { label: "Modern Charcoal", headerBg: DARK_BG, totalBg: LIGHT_BG, totalText: INK, heading: INK },
  teal:     { label: "Teal Classic",    headerBg: "#0D7288", totalBg: "#E1F2F5", totalText: "#0D7288", heading: "#0D7288" },
  gold:     { label: "Gold Accent",     headerBg: "#C05F0F", totalBg: "#FCEBDA", totalText: "#C05F0F", heading: "#C05F0F" },
};
const themeFor = (key) => THEMES[key] || THEMES.charcoal;

const FONTS_DIR = path.join(__dirname, "../assets/fonts");
// Same logo file the app's own sidebar uses (frontend/public/logo-address-gateway.png) — real
// PNG, not a font-drawn recreation, so the PDF and the UI always show the exact same wordmark.
const LOGO_PATH = path.join(__dirname, "../../frontend/public/logo-address-gateway.png");
const LOGO_ASPECT = 1410 / 613; // native px dimensions of that file
// Real Inter font files (same family the web app itself uses) registered once per PDFDocument —
// PDFKit's built-in fonts (Helvetica, Courier, ...) don't match the original quotation format.
function registerFonts(doc) {
  doc.registerFont("Inter", path.join(FONTS_DIR, "inter-400.ttf"));
  doc.registerFont("Inter-Medium", path.join(FONTS_DIR, "inter-500.ttf"));
  doc.registerFont("Inter-SemiBold", path.join(FONTS_DIR, "inter-600.ttf"));
  doc.registerFont("Inter-Bold", path.join(FONTS_DIR, "inter-700.ttf"));
}

const money2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return "";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${day}-${m}-${y}`;
};

/** Draws the real brand logo (same PNG as the app's sidebar), right-aligned, at (rightX, y). Returns the y after it. */
function drawBrandHeader(doc, rightX, y) {
  const logoHeight = 34;
  const logoWidth = logoHeight * LOGO_ASPECT;
  doc.image(LOGO_PATH, rightX - logoWidth, y, { height: logoHeight });
  y += logoHeight + 6;
  doc.fontSize(9)
    .text("Address Gateway Building", MARGIN, y, { width: rightX - MARGIN, align: "right" });
  y = doc.y;
  doc.text("D Ring Road, Doha, Qatar", MARGIN, y, { width: rightX - MARGIN, align: "right" });
  y = doc.y;
  doc.text("Call: 44434912, Email : startup@addressgateway.com", MARGIN, y, { width: rightX - MARGIN, align: "right" });
  y = doc.y;
  doc.text("www.addressgateway.com", MARGIN, y, { width: rightX - MARGIN, align: "right" });
  doc.fillColor(INK);
  return doc.y;
}

/** Draws the customer name (bold) and, if present, their saved address underneath it — both
 * right-aligned to match the on-screen "Bill To" block. Returns the y after the last line. */
function drawBillTo(doc, quotation, rightX, y) {
  doc.font("Inter-SemiBold").fontSize(10.5).fillColor(INK).text(quotation.customer || "", MARGIN, y, { width: rightX - MARGIN, align: "right" });
  y = doc.y;
  const addressLines = (quotation.customer_address || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (addressLines.length) {
    doc.font("Inter").fontSize(8.5).fillColor(GRAY);
    addressLines.forEach((line) => {
      doc.text(line, MARGIN, y, { width: rightX - MARGIN, align: "right" });
      y = doc.y;
    });
    doc.fillColor(INK);
  }
  return y;
}

function drawTableHeader(doc, y, colX, tableRight, headerBg) {
  doc.rect(MARGIN, y, tableRight - MARGIN, 22).fill(headerBg || DARK_BG);
  doc.font("Inter-SemiBold").fontSize(9).fillColor("#FFFFFF");
  doc.text("#", colX.idx + 5, y + 7, { width: colX.desc - colX.idx - 10 });
  doc.text("Item & Description", colX.desc, y + 7, { width: colX.rate - colX.desc - 5 });
  doc.text("Rate", colX.rate, y + 7, { width: colX.amount - colX.rate - 5, align: "right" });
  doc.text("Amount", colX.amount, y + 7, { width: tableRight - colX.amount - 5, align: "right" });
  doc.fillColor(INK);
  return y + 22;
}

/** Streams a real A4 PDF for `quotation` (already parsed: items is an array) directly to `res`. */
function generateQuotationPdf(quotation, res) {
  const items = quotation.items || [];
  const orderDiscount = Number(quotation.order_discount ?? quotation.orderDiscount ?? 0);
  const orderDiscountType = quotation.order_discount_type ?? quotation.orderDiscountType ?? "amount";
  const { subtotal, itemDiscountTotal, discountAmount, total } = quoteTotal(items, orderDiscount, orderDiscountType);
  const theme = themeFor(quotation.theme);

  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Quotation-${quotation.id}.pdf"`);
  doc.pipe(res);

  const tableRight = doc.page.width - MARGIN;
  const colX = { idx: MARGIN, desc: MARGIN + 25, rate: MARGIN + 340, amount: MARGIN + 430 };

  // --- Header: "QUOTE" title + quote# on the left, brand wordmark + address on the right -------
  const headerTop = MARGIN;
  doc.font("Inter-Bold").fontSize(30).fillColor(INK).text("QUOTE", MARGIN, headerTop, { lineBreak: false });
  doc.font("Inter").fontSize(9).fillColor(GRAY).text(`Quote# ${formatQuoteNumber(quotation.id)}`, MARGIN, headerTop + 34, { lineBreak: false });
  const brandBottomY = drawBrandHeader(doc, tableRight, headerTop);
  let y = Math.max(headerTop + 50, brandBottomY) + 20;

  // --- Quote Date / Bill To row — date label and value share one line (matches the original
  // format); Bill To stacks the customer name and, if saved, their address underneath -----------
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Quote Date :", MARGIN, y);
  doc.font("Inter").fontSize(9).fillColor(INK).text(fmtDate(quotation.created_at) || "-", MARGIN + 80, y);
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Bill To", MARGIN, y, { width: tableRight - MARGIN, align: "right" });
  const billToBottomY = drawBillTo(doc, quotation, tableRight, doc.y + 2);
  y = Math.max(y + 14, billToBottomY) + 16;

  // --- Subject ---------------------------------------------------------------------------------
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Subject :", MARGIN, y);
  y = doc.y + 1;
  doc.font("Inter").fontSize(10).fillColor(INK).text(quotation.subject || items[0]?.service || "Quotation", MARGIN, y, { width: tableRight - MARGIN });
  y = doc.y + 14;

  // --- Line items table (grouped by category, matching the on-screen PDF preview) --------------
  // Table-only page breaks re-draw the dark column header; every section after the table just
  // needs a plain page break (this distinction is what page 2 was missing — the acceptance form
  // was re-triggering the item table header because it reused the table's break helper).
  const ensureRoom = (needed) => {
    if (y + needed > doc.page.height - MARGIN - 40) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const ensureTableRoom = (needed) => {
    if (y + needed > doc.page.height - MARGIN - 40) {
      doc.addPage();
      y = drawTableHeader(doc, MARGIN, colX, tableRight, theme.headerBg);
    }
  };

  // Classification for both the light background band behind each line and the Government Fee
  // Total / Professional Fee Total split below. Trusts a line's own feeType when it's actually
  // set; only when it's blank does it fall back to matching "government"/"professional" in the
  // line's category text, and finally to the quotation's whole-document fee type for a line with
  // neither — covers older quotations/templates whose items were never individually tagged.
  const isGovFeeItem = (it) => {
    if (it.feeType) return it.feeType === "Government Fee";
    const cat = (it.category || "").toLowerCase();
    if (cat.includes("government")) return true;
    if (cat.includes("professional")) return false;
    return (quotation.fee_type || quotation.feeType || "Professional Fee") === "Government Fee";
  };
  const bandColor = (it) => (isGovFeeItem(it) ? GOV_FEE_BG : PROF_FEE_BG);

  y = drawTableHeader(doc, y, colX, tableRight, theme.headerBg);
  let lastCategory = null;
  let rowNumber = 0;
  items.forEach((it) => {
    if ((it.category || "") && it.category !== lastCategory) {
      ensureTableRoom(20);
      const headerTop = y;
      doc.font("Inter-SemiBold").fontSize(9.5).fillColor(INK).text(it.category, MARGIN, y + 6, { width: tableRight - MARGIN });
      y = doc.y + 4;
      doc.rect(MARGIN, headerTop, tableRight - MARGIN, y - headerTop).fill(bandColor(it));
      doc.font("Inter-SemiBold").fontSize(9.5).fillColor(INK).text(it.category, MARGIN, headerTop + 6, { width: tableRight - MARGIN });
      doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
      y += 4;
      lastCategory = it.category;
    }
    rowNumber++;
    const descText = it.description || it.service || "";
    const descWidth = colX.rate - colX.desc - 5;
    const descHeight = doc.font("Inter").fontSize(9.5).heightOfString(descText, { width: descWidth });
    const noteHeight = it.note ? doc.font("Inter").fontSize(8).heightOfString(it.note, { width: descWidth }) + 3 : 0;
    const rowHeight = Math.max(18, descHeight + noteHeight + 8);

    ensureTableRoom(rowHeight);
    doc.rect(MARGIN, y, tableRight - MARGIN, rowHeight).fill(bandColor(it));
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(String(rowNumber), colX.idx + 5, y + 6, { width: colX.desc - colX.idx - 10 });
    doc.text(descText, colX.desc, y + 6, { width: descWidth });
    if (it.note) {
      doc.font("Inter").fontSize(8).fillColor(GRAY).text(it.note, colX.desc, doc.y + 1, { width: descWidth });
    }
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(it.price), colX.rate, y + 6, { width: colX.amount - colX.rate - 5, align: "right" });
    const lineAmount = (Number(it.qty) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discountPct) || 0) / 100);
    doc.text(money2(lineAmount), colX.amount, y + 6, { width: tableRight - colX.amount - 5, align: "right" });
    y += rowHeight;
    doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
  });
  y += 12;

  // --- Government Fee Total / Professional Fee Total / Sub Total / Discount / Total -------------
  // Pre-discount split, ordered to match whichever classification actually appears first among
  // the items — so reordering the line items also reorders the two totals underneath them.
  const govFeeTotal = items.filter(isGovFeeItem).reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discountPct) || 0) / 100), 0);
  const profFeeTotal = subtotal - govFeeTotal;
  const firstGovIdx = items.findIndex(isGovFeeItem);
  const firstProfIdx = items.findIndex((it) => !isGovFeeItem(it));
  const govFirst = firstGovIdx !== -1 && (firstProfIdx === -1 || firstGovIdx < firstProfIdx);
  ensureRoom(118); // +16 over the old fixed estimate to cover the new "Item Discount" line
  const totalsWidth = 220;
  const totalsX = tableRight - totalsWidth;
  const drawFeeTotalLine = (label, amount) => {
    doc.font("Inter").fontSize(9.5).fillColor(GRAY).text(label, totalsX, y, { width: 110 });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(amount), totalsX + 110, y, { width: totalsWidth - 110, align: "right" });
    y += 16;
  };
  if (govFeeTotal > 0 && profFeeTotal > 0) {
    if (govFirst) { drawFeeTotalLine("Government Fee Total", govFeeTotal); drawFeeTotalLine("Professional Fee Total", profFeeTotal); }
    else { drawFeeTotalLine("Professional Fee Total", profFeeTotal); drawFeeTotalLine("Government Fee Total", govFeeTotal); }
  }
  if (itemDiscountTotal > 0) {
    doc.font("Inter").fontSize(9.5).fillColor(GRAY).text("Item Discount", totalsX, y, { width: 110 });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(`(-) ${money2(itemDiscountTotal)}`, totalsX + 110, y, { width: totalsWidth - 110, align: "right" });
    y += 16;
  }
  doc.font("Inter").fontSize(9.5).fillColor(GRAY).text("Sub Total", totalsX, y, { width: 110 });
  doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(subtotal), totalsX + 110, y, { width: totalsWidth - 110, align: "right" });
  y += 16;
  if (discountAmount > 0) {
    const label = orderDiscountType === "percent" ? `Discount (${money2(orderDiscount)}%)` : "Discount";
    doc.font("Inter").fontSize(9.5).fillColor(GRAY).text(label, totalsX, y, { width: 110 });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(`(-) ${money2(discountAmount)}`, totalsX + 110, y, { width: totalsWidth - 110, align: "right" });
    y += 16;
  }
  doc.rect(totalsX, y - 2, totalsWidth, 20).fill(theme.totalBg);
  doc.font("Inter-SemiBold").fontSize(10.5).fillColor(theme.totalText).text("Total", totalsX + 6, y + 3, { width: 104 });
  doc.font("Inter-Bold").fontSize(10.5).text(`QAR ${money2(total)}`, totalsX + 110, y + 3, { width: totalsWidth - 116, align: "right" });
  y += 30;

  // --- Notes / Terms & Conditions / Bank Account Details ----------------------------------------
  const noteLines = (quotation.notes || "").split("\n").map((t) => t.trim()).filter(Boolean);
  const termLines = (quotation.terms || "").split("\n").map((t) => t.trim()).filter(Boolean);

  if (noteLines.length) {
    ensureRoom(30);
    doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
    y += 12;
    doc.font("Inter").fontSize(9).fillColor(GRAY).text("Notes", MARGIN, y);
    y = doc.y + 4;
    noteLines.forEach((line) => {
      ensureRoom(16);
      doc.font("Inter").fontSize(9).fillColor(INK).text(line, MARGIN, y, { width: tableRight - MARGIN });
      y = doc.y + 3;
    });
    y += 10;
  }

  if (termLines.length) {
    ensureRoom(40);
    doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
    y += 12;
    doc.font("Inter-SemiBold").fontSize(11).fillColor(theme.heading).text("Terms & Conditions", MARGIN, y);
    y = doc.y + 8;
    termLines.forEach((line, i) => {
      const width = tableRight - MARGIN - 16;
      const h = doc.font("Inter").fontSize(9).heightOfString(line, { width });
      ensureRoom(h + 6);
      doc.font("Inter").fontSize(9).fillColor(INK).text(`${i + 1}.`, MARGIN, y, { width: 14 });
      doc.text(line, MARGIN + 16, y, { width });
      y = doc.y + 6;
    });
    y += 6;
  }

  ensureRoom(60);
  doc.font("Inter-SemiBold").fontSize(11).fillColor(theme.heading).text("Bank Account Details", MARGIN, y);
  y = doc.y + 8;
  const bankLines = (quotation.bank || DEFAULT_BANK).split("\n").map((t) => t.trim()).filter(Boolean);
  bankLines.forEach((line) => {
    ensureRoom(14);
    doc.font("Inter").fontSize(9).fillColor(INK).text(line, MARGIN, y, { width: tableRight - MARGIN });
    y = doc.y + 3;
  });
  y += 14;

  // --- Disclaimer --------------------------------------------------------------------------------
  ensureRoom(60);
  doc.font("Inter").fontSize(8).fillColor(GRAY).text(DISCLAIMER_1, MARGIN, y, { width: tableRight - MARGIN });
  y = doc.y + 8;
  ensureRoom(40);
  doc.font("Inter").fontSize(8).fillColor(GRAY).text(DISCLAIMER_2, MARGIN, y, { width: tableRight - MARGIN });
  y = doc.y + 20;

  // --- Acceptance form ---------------------------------------------------------------------------
  ensureRoom(90);
  doc.font("Inter-SemiBold").fontSize(10).fillColor(theme.heading).text("ACCEPTANCE FORM:", MARGIN, y);
  y = doc.y + 6;
  doc.font("Inter").fontSize(9).fillColor(INK)
    .text("I hereby, accept the above offer and I will endeavor to complete/submit all the required documents along with the agreed payment terms.", MARGIN, y, { width: tableRight - MARGIN });
  y = doc.y + 20;

  const colWidth = (tableRight - MARGIN - 30) / 2;
  const drawField = (label, x, yy, w) => {
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(label, x, yy, { lineBreak: false });
    const labelWidth = doc.widthOfString(label) + 4;
    doc.moveTo(x + labelWidth, yy + 11).lineTo(x + w, yy + 11).strokeColor("#999999").stroke();
  };
  drawField("Name:", MARGIN, y, colWidth);
  drawField("Date:", MARGIN + colWidth + 30, y, colWidth);
  y += 30;
  drawField("Signature:", MARGIN, y, colWidth);
  drawField("Mobile No.:", MARGIN + colWidth + 30, y, colWidth);

  // --- Footer note + DRAFT watermark, both repeated on every page. The watermark marks any
  // quotation that hasn't actually been sent to the client yet (still Draft, or awaiting
  // approval) so a copy shared or downloaded early is unmistakably not final. ---
  const footerText = quotation.footer_note || DEFAULT_FOOTER_NOTE;
  const isUnsent = ["Draft", "Pending Manager Approval"].includes(quotation.status);
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (isUnsent) {
      doc.save();
      doc.opacity(0.15);
      doc.font("Inter-Bold").fontSize(120).fillColor("#C0392B")
        .rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] })
        .text("DRAFT", 0, doc.page.height / 2 - 60, { width: doc.page.width, align: "center", lineBreak: false });
      doc.restore();
    }
    doc.font("Inter").fontSize(7).fillColor(GRAY)
      .text(footerText, MARGIN, doc.page.height - MARGIN - 24, { width: doc.page.width - MARGIN * 2, align: "center" });
    doc.fillColor(INK);
  }

  doc.end();
}

module.exports = { generateQuotationPdf, DEFAULT_BANK, DEFAULT_FOOTER_NOTE, THEMES };
