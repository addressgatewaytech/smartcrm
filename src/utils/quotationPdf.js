// Server-side A4 PDF generation for quotations (PDFKit — no headless browser needed, which
// keeps this friendly to Hostinger shared hosting). Mirrors the "PDF preview" tab in the
// Quotation detail modal (frontend/src/App.jsx, QuoteDetailModal's view==="pdf" branch) field
// for field, so what a user sees on screen is what downloads — logo wordmark, dark table header,
// Bank Account Details, disclaimer and Acceptance Form included.
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

const MARGIN = 40;
const TEAL = "#1391AC";
const NAVY = "#0E3350";
const GOLD = "#E8791E";
const GRAY = "#6b7178";
const INK = "#151A1F";
const DARK_BG = "#2A2E33";
const HAIR = "#E1E6E8";
const LIGHT_BG = "#F5F6F6";

const money2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return "";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${day}-${m}-${y}`;
};

/** Draws the brand wordmark ("ADDRESS GATEWAY" in three colors, right-aligned) at (rightX, y). Returns the y after it. */
function drawBrandHeader(doc, rightX, y) {
  doc.font("Helvetica-Bold").fontSize(15);
  const parts = [["ADDRESS ", TEAL], ["GATE", NAVY], ["WAY", GOLD]];
  const totalWidth = parts.reduce((w, [t]) => w + doc.widthOfString(t), 0);
  let x = rightX - totalWidth;
  parts.forEach(([t, color]) => {
    doc.fillColor(color).text(t, x, y, { lineBreak: false });
    x += doc.widthOfString(t);
  });
  doc.fillColor(INK);
  y += 16;
  doc.font("Helvetica").fontSize(8).fillColor(GRAY)
    .text("BUSINESS SERVICES", MARGIN, y, { width: rightX - MARGIN, align: "right", characterSpacing: 1.2 });
  y = doc.y + 4;
  doc.fontSize(8.5)
    .text("Address Gateway Building, D Ring Road, Doha, Qatar", MARGIN, y, { width: rightX - MARGIN, align: "right" });
  y = doc.y;
  doc.text("Call: 44434912  ·  startup@addressgateway.com  ·  www.addressgateway.com", MARGIN, y, { width: rightX - MARGIN, align: "right" });
  doc.fillColor(INK);
  return doc.y;
}

/** Draws the customer name (bold) and, if present, their saved address underneath it — both
 * right-aligned to match the on-screen "Bill To" block. Returns the y after the last line. */
function drawBillTo(doc, quotation, rightX, y) {
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(quotation.customer || "", MARGIN, y, { width: rightX - MARGIN, align: "right" });
  y = doc.y;
  const addressLines = (quotation.customer_address || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (addressLines.length) {
    doc.font("Helvetica").fontSize(8.5).fillColor(GRAY);
    addressLines.forEach((line) => {
      doc.text(line, MARGIN, y, { width: rightX - MARGIN, align: "right" });
      y = doc.y;
    });
    doc.fillColor(INK);
  }
  return y;
}

function drawTableHeader(doc, y, colX, tableRight) {
  doc.rect(MARGIN, y, tableRight - MARGIN, 22).fill(DARK_BG);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");
  doc.text("#", colX.idx, y + 7, { width: colX.desc - colX.idx - 5 });
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
  const { subtotal, total } = quoteTotal(items, orderDiscount);

  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Quotation-${quotation.id}.pdf"`);
  doc.pipe(res);

  const tableRight = doc.page.width - MARGIN;
  const colX = { idx: MARGIN, desc: MARGIN + 25, rate: MARGIN + 340, amount: MARGIN + 430 };

  // --- Header: "QUOTE" title + quote# on the left, brand wordmark + address on the right -------
  const headerTop = MARGIN;
  doc.font("Helvetica-Bold").fontSize(24).fillColor(INK).text("QUOTE", MARGIN, headerTop, { lineBreak: false });
  doc.font("Courier").fontSize(9).fillColor(GRAY).text(`Quote# AGBS/${quotation.id}`, MARGIN, headerTop + 30, { lineBreak: false });
  const brandBottomY = drawBrandHeader(doc, tableRight, headerTop);
  let y = Math.max(headerTop + 44, brandBottomY) + 14;

  // --- Quote Date / Bill To row (Bill To can run to several lines once the address is included,
  // so the row height below it is driven by whichever side — date or address — is taller) -------
  doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("Quote Date :", MARGIN, y);
  doc.fontSize(9).fillColor(GRAY).text("Bill To", MARGIN, y, { width: tableRight - MARGIN, align: "right" });
  y += 13;
  doc.font("Helvetica").fontSize(10).fillColor(INK).text(fmtDate(quotation.created_at) || "-", MARGIN, y);
  const billToBottomY = drawBillTo(doc, quotation, tableRight, y);
  y = Math.max(y + 11, billToBottomY) + 14;

  // --- Subject ---------------------------------------------------------------------------------
  doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("Subject :", MARGIN, y);
  y = doc.y + 1;
  doc.font("Helvetica").fontSize(10).fillColor(INK).text(quotation.subject || items[0]?.service || "Quotation", MARGIN, y, { width: tableRight - MARGIN });
  y = doc.y + (quotation.fee_type === "Government Fee" ? 4 : 14);
  if (quotation.fee_type === "Government Fee") {
    doc.font("Helvetica").fontSize(8).fillColor(GRAY)
      .text("Pass-through government charges — excluded from Address Gateway's business volume and incentive calculations.", MARGIN, y, { width: tableRight - MARGIN });
    y = doc.y + 14;
  }

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
      y = drawTableHeader(doc, MARGIN, colX, tableRight);
    }
  };

  y = drawTableHeader(doc, y, colX, tableRight);
  let lastCategory = null;
  let rowNumber = 0;
  items.forEach((it) => {
    if ((it.category || "") && it.category !== lastCategory) {
      ensureTableRoom(20);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(it.category, MARGIN, y + 6, { width: tableRight - MARGIN });
      y = doc.y + 4;
      doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
      y += 4;
      lastCategory = it.category;
    }
    rowNumber++;
    const descText = it.description || it.service || "";
    const descWidth = colX.rate - colX.desc - 5;
    const descHeight = doc.font("Helvetica").fontSize(9.5).heightOfString(descText, { width: descWidth });
    const noteHeight = it.note ? doc.font("Helvetica").fontSize(8).heightOfString(it.note, { width: descWidth }) + 3 : 0;
    const rowHeight = Math.max(18, descHeight + noteHeight + 8);

    ensureTableRoom(rowHeight);
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(String(rowNumber), colX.idx, y + 6, { width: colX.desc - colX.idx - 5 });
    doc.text(descText, colX.desc, y + 6, { width: descWidth });
    if (it.note) {
      doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(it.note, colX.desc, doc.y + 1, { width: descWidth });
    }
    doc.font("Courier").fontSize(9.5).fillColor(INK).text(money2(it.price), colX.rate, y + 6, { width: colX.amount - colX.rate - 5, align: "right" });
    const lineAmount = (Number(it.qty) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discountPct) || 0) / 100);
    doc.text(money2(lineAmount), colX.amount, y + 6, { width: tableRight - colX.amount - 5, align: "right" });
    y += rowHeight;
    doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
  });
  y += 12;

  // --- Sub Total / Discount / Total (right-aligned mini table, Total row shaded) ---------------
  ensureRoom(70);
  const totalsWidth = 220;
  const totalsX = tableRight - totalsWidth;
  doc.font("Helvetica").fontSize(9.5).fillColor(GRAY).text("Sub Total", totalsX, y, { width: 110 });
  doc.font("Courier").fontSize(9.5).fillColor(INK).text(money2(subtotal), totalsX + 110, y, { width: totalsWidth - 110, align: "right" });
  y += 16;
  if (orderDiscount > 0) {
    doc.font("Helvetica").fontSize(9.5).fillColor(GRAY).text("Discount", totalsX, y, { width: 110 });
    doc.font("Courier").fontSize(9.5).fillColor(INK).text(`(-) ${money2(orderDiscount)}`, totalsX + 110, y, { width: totalsWidth - 110, align: "right" });
    y += 16;
  }
  doc.rect(totalsX, y - 2, totalsWidth, 20).fill(LIGHT_BG);
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text("Total", totalsX + 6, y + 3, { width: 104 });
  doc.font("Courier-Bold").fontSize(10.5).text(`QAR${money2(total)}`, totalsX + 110, y + 3, { width: totalsWidth - 116, align: "right" });
  y += 30;

  // --- Notes / Terms & Conditions / Bank Account Details ----------------------------------------
  const noteLines = (quotation.notes || "").split("\n").map((t) => t.trim()).filter(Boolean);
  const termLines = (quotation.terms || "").split("\n").map((t) => t.trim()).filter(Boolean);

  if (noteLines.length) {
    ensureRoom(30);
    doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
    y += 12;
    doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("Notes", MARGIN, y);
    y = doc.y + 4;
    noteLines.forEach((line) => {
      ensureRoom(16);
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(line, MARGIN, y, { width: tableRight - MARGIN });
      y = doc.y + 3;
    });
    y += 10;
  }

  if (termLines.length) {
    ensureRoom(40);
    doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
    y += 12;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("Terms & Conditions", MARGIN, y);
    y = doc.y + 8;
    termLines.forEach((line, i) => {
      const width = tableRight - MARGIN - 16;
      const h = doc.font("Helvetica").fontSize(9).heightOfString(line, { width });
      ensureRoom(h + 6);
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(`${i + 1}.`, MARGIN, y, { width: 14 });
      doc.text(line, MARGIN + 16, y, { width });
      y = doc.y + 6;
    });
    y += 6;
  }

  ensureRoom(60);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("Bank Account Details", MARGIN, y);
  y = doc.y + 8;
  const bankLines = (quotation.bank || DEFAULT_BANK).split("\n").map((t) => t.trim()).filter(Boolean);
  bankLines.forEach((line) => {
    ensureRoom(14);
    doc.font("Helvetica").fontSize(9).fillColor(INK).text(line, MARGIN, y, { width: tableRight - MARGIN });
    y = doc.y + 3;
  });
  y += 14;

  // --- Disclaimer --------------------------------------------------------------------------------
  ensureRoom(60);
  doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(DISCLAIMER_1, MARGIN, y, { width: tableRight - MARGIN });
  y = doc.y + 8;
  ensureRoom(40);
  doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(DISCLAIMER_2, MARGIN, y, { width: tableRight - MARGIN });
  y = doc.y + 20;

  // --- Acceptance form ---------------------------------------------------------------------------
  ensureRoom(90);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("ACCEPTANCE FORM:", MARGIN, y);
  y = doc.y + 6;
  doc.font("Helvetica").fontSize(9).fillColor(INK)
    .text("I hereby, accept the above offer and I will endeavor to complete/submit all the required documents along with the agreed payment terms.", MARGIN, y, { width: tableRight - MARGIN });
  y = doc.y + 20;

  const colWidth = (tableRight - MARGIN - 30) / 2;
  const drawField = (label, x, yy, w) => {
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(label, x, yy, { lineBreak: false });
    const labelWidth = doc.widthOfString(label) + 4;
    doc.moveTo(x + labelWidth, yy + 11).lineTo(x + w, yy + 11).strokeColor("#999999").stroke();
  };
  drawField("Name:", MARGIN, y, colWidth);
  drawField("Date:", MARGIN + colWidth + 30, y, colWidth);
  y += 30;
  drawField("Signature:", MARGIN, y, colWidth);
  drawField("Mobile No.:", MARGIN + colWidth + 30, y, colWidth);

  // --- Footer note, repeated on every page (per spec: must repeat, editable per template/quotation) ---
  const footerText = quotation.footer_note || DEFAULT_FOOTER_NOTE;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7).fillColor(GRAY)
      .text(footerText, MARGIN, doc.page.height - MARGIN - 24, { width: doc.page.width - MARGIN * 2, align: "center" });
    doc.fillColor(INK);
  }

  doc.end();
}

module.exports = { generateQuotationPdf, DEFAULT_BANK, DEFAULT_FOOTER_NOTE };
