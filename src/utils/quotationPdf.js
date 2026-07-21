// Server-side A4 PDF generation for quotations (PDFKit — no headless browser needed, which
// keeps this friendly to Hostinger shared hosting). Replaces the prototype's HTML+print-dialog
// workaround per the build brief (§2 Quotations, §7).
const PDFDocument = require("pdfkit");
const { quoteTotal, money } = require("./helpers");

const DEFAULT_BANK = [
  "ADDRESS GATEWAY BUSINESS SERVICES",
  "Bank: Commercial Bank",
  "Account Number: 4680-21670035-001",
  "IBAN: QA14CBQA00000468021670035001",
  "Company Fawran: ER-17274261",
  "Doha, Qatar",
].join("\n");

const DEFAULT_FOOTER_NOTE =
  "This quotation is valid until the date stated above and is subject to Address Gateway Business Services' standard terms and conditions. " +
  "Prices are quoted in Qatari Riyal (QAR) and exclude any government fees unless explicitly listed as a line item.";

const MARGIN = 40;

// Compact number format for table cells (no "QAR " prefix — the column header states the
// currency once, which avoids the value wrapping onto a second line and overlapping the row below).
const moneyShort = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function drawTableHeader(doc, y, colX, tableRight) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
  doc.text("#", colX.idx, y, { width: 20 });
  doc.text("Description", colX.desc, y, { width: colX.qty - colX.desc - 5 });
  doc.text("Qty", colX.qty, y, { width: colX.price - colX.qty - 5, align: "right" });
  doc.text("Price (QAR)", colX.price, y, { width: colX.disc - colX.price - 5, align: "right" });
  doc.text("Disc%", colX.disc, y, { width: colX.total - colX.disc - 5, align: "right" });
  doc.text("Total (QAR)", colX.total, y, { width: tableRight - colX.total, align: "right" });
  doc.moveTo(MARGIN, y + 14).lineTo(tableRight, y + 14).strokeColor("#cccccc").stroke();
  return y + 20;
}

/** Streams a real A4 PDF for `quotation` (already parsed: items is an array) directly to `res`. */
function generateQuotationPdf(quotation, res) {
  const items = quotation.items || [];
  const orderDiscount = Number(quotation.order_discount ?? quotation.orderDiscount ?? 0);
  const { subtotal, total } = quoteTotal(items, orderDiscount);

  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${quotation.id}.pdf"`);
  doc.pipe(res);

  const tableRight = doc.page.width - MARGIN;
  const colX = { idx: MARGIN, desc: MARGIN + 25, qty: MARGIN + 275, price: MARGIN + 315, disc: MARGIN + 385, total: MARGIN + 430 };

  // --- Header -------------------------------------------------------------------------------
  doc.font("Helvetica-Bold").fontSize(16).text("ADDRESS GATEWAY BUSINESS SERVICES", MARGIN, MARGIN);
  doc.font("Helvetica").fontSize(9).fillColor("#555555")
    .text("Company Formation | PRO Services | Bank Account Assistance | Office Space | Doha, Qatar", MARGIN, doc.y);
  doc.fillColor("#000000").moveDown(1);

  doc.font("Helvetica-Bold").fontSize(13).text(`Quotation ${quotation.id}`, MARGIN, doc.y);
  doc.font("Helvetica").fontSize(9);
  doc.text(`Date: ${String(quotation.created_at || "").slice(0, 10)}`, MARGIN, doc.y);
  doc.text(`Valid Till: ${quotation.valid_till || "-"}`, MARGIN, doc.y);
  doc.text(`Fee Type: ${quotation.fee_type}`, MARGIN, doc.y);
  doc.text(`Customer: ${quotation.customer}`, MARGIN, doc.y);
  if (quotation.subject) doc.text(`Subject: ${quotation.subject}`, MARGIN, doc.y);
  doc.moveDown(0.75);

  // --- Line items table -----------------------------------------------------------------------
  let y = drawTableHeader(doc, doc.y, colX, tableRight);
  doc.font("Helvetica").fontSize(9);
  items.forEach((it, i) => {
    const lineTotal = (Number(it.qty) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discountPct) || 0) / 100);
    const descLines = [it.category, it.service, it.description, it.note].filter(Boolean).join(" — ");
    const descWidth = colX.qty - colX.desc - 5;
    const rowHeight = Math.max(16, doc.heightOfString(descLines || "-", { width: descWidth }) + 6);

    if (y + rowHeight > doc.page.height - MARGIN - 90) {
      doc.addPage();
      y = drawTableHeader(doc, MARGIN, colX, tableRight);
    }

    doc.text(String(i + 1), colX.idx, y, { width: 20 });
    doc.text(descLines || "-", colX.desc, y, { width: descWidth });
    doc.text(String(it.qty ?? ""), colX.qty, y, { width: colX.price - colX.qty - 5, align: "right" });
    doc.text(moneyShort(it.price), colX.price, y, { width: colX.disc - colX.price - 5, align: "right" });
    doc.text(it.discountPct ? `${it.discountPct}%` : "-", colX.disc, y, { width: colX.total - colX.disc - 5, align: "right" });
    doc.text(moneyShort(lineTotal), colX.total, y, { width: tableRight - colX.total, align: "right" });
    y += rowHeight;
  });

  y += 6;
  doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor("#cccccc").stroke();
  y += 10;

  if (y > doc.page.height - MARGIN - 160) {
    doc.addPage();
    y = MARGIN;
  }

  doc.font("Helvetica").fontSize(9).text(`Subtotal: ${money(subtotal)}`, MARGIN, y, { width: tableRight - MARGIN, align: "right" });
  y = doc.y + 2;
  if (orderDiscount > 0) {
    doc.text(`Order Discount: -${money(orderDiscount)}`, MARGIN, y, { width: tableRight - MARGIN, align: "right" });
    y = doc.y + 2;
  }
  doc.font("Helvetica-Bold").fontSize(12).text(`Total: ${money(total)}`, MARGIN, y, { width: tableRight - MARGIN, align: "right" });
  y = doc.y + 20;

  // --- Notes / Terms / Bank -------------------------------------------------------------------
  const section = (label, body) => {
    if (!body) return;
    if (y > doc.page.height - MARGIN - 100) { doc.addPage(); y = MARGIN; }
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text(label, MARGIN, y, { width: tableRight - MARGIN });
    y = doc.y + 2;
    doc.font("Helvetica").fontSize(9).text(body, MARGIN, y, { width: tableRight - MARGIN });
    y = doc.y + 12;
  };

  section("Notes", quotation.notes);
  section("Terms & Conditions", quotation.terms);
  section("Bank Details", quotation.bank || DEFAULT_BANK);

  // --- Footer note, repeated on every page (per spec: must repeat, editable per template/quotation) ---
  const footerText = quotation.footer_note || DEFAULT_FOOTER_NOTE;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7).fillColor("#777777")
      .text(footerText, MARGIN, doc.page.height - MARGIN - 24, { width: doc.page.width - MARGIN * 2, align: "center" });
    doc.fillColor("#000000");
  }

  doc.end();
}

module.exports = { generateQuotationPdf, DEFAULT_BANK, DEFAULT_FOOTER_NOTE };
