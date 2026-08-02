// Server-side A4 PDF for an Invoice — same PDFKit approach and brand header as quotationPdf.js.
const PDFDocument = require("pdfkit");
const { MARGIN, GRAY, INK, HAIR, LIGHT_BG, registerFonts, money2, fmtDate, drawBrandHeader, drawBillTo, drawItemsTable, drawWatermark } = require("./pdfCommon");

const FOOTER_NOTE = "Please make payment by the due date to the bank account details shared separately.";

/** Streams a real A4 PDF for `invoice` (with its `payments` array attached) directly to `res`. */
function generateInvoicePdf(invoice, res) {
  const amount = Number(invoice.amount || 0);
  const profFee = Number(invoice.professional_fee_amount ?? amount);
  const govFee = Math.max(0, amount - profFee);
  const isMixed = govFee > 0.005 && profFee > 0.005;
  const feeTypeLabel = isMixed ? "Professional + Government Fee" : (invoice.fee_type || "Professional Fee");
  const payments = invoice.payments || [];
  const paid = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const balance = Math.max(0, amount - paid);

  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Invoice-${invoice.id}.pdf"`);
  doc.pipe(res);

  const tableRight = doc.page.width - MARGIN;

  const headerTop = MARGIN;
  doc.font("Inter-Bold").fontSize(28).fillColor(INK).text("INVOICE", MARGIN, headerTop, { lineBreak: false });
  doc.font("Inter").fontSize(9).fillColor(GRAY).text(`Invoice# ${invoice.id}`, MARGIN, headerTop + 32, { lineBreak: false });
  const brandBottomY = drawBrandHeader(doc, tableRight, headerTop);
  let y = Math.max(headerTop + 48, brandBottomY) + 20;

  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Invoice Date :", MARGIN, y);
  doc.font("Inter").fontSize(9).fillColor(INK).text(fmtDate(invoice.created_at) || "-", MARGIN + 90, y);
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Bill To", MARGIN, y, { width: tableRight - MARGIN, align: "right" });
  const billToBottomY = drawBillTo(doc, invoice.customer, tableRight, doc.y + 2);
  y = Math.max(y + 14, billToBottomY) + 6;
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Due Date :", MARGIN, y);
  doc.font("Inter").fontSize(9).fillColor(INK).text(fmtDate(invoice.due_date) || "-", MARGIN + 90, y);
  y = doc.y + 20;

  if (invoice.sales_order_id) {
    doc.font("Inter").fontSize(9).fillColor(GRAY).text("Sales Order Ref :", MARGIN, y);
    doc.font("Inter").fontSize(9).fillColor(INK).text(invoice.sales_order_id, MARGIN + 100, y);
    y = doc.y + 10;
  }
  if (invoice.subscription_id) {
    doc.font("Inter").fontSize(9).fillColor(GRAY).text("Subscription Ref :", MARGIN, y);
    doc.font("Inter").fontSize(9).fillColor(INK).text(invoice.subscription_id, MARGIN + 100, y);
    y = doc.y + 10;
  }
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Fee Type :", MARGIN, y);
  doc.font("Inter").fontSize(9).fillColor(INK).text(feeTypeLabel, MARGIN + 100, y);
  y = doc.y + 20;

  const items = invoice.items || [];
  if (items.length) {
    ({ y } = drawItemsTable(doc, items, y, tableRight));
  }

  const totalsWidth = 260;
  const totalsX = tableRight - totalsWidth;
  if (isMixed) {
    doc.font("Inter").fontSize(9.5).fillColor(GRAY).text("Professional Fee Amount", totalsX, y, { width: 150 });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(profFee), totalsX + 150, y, { width: totalsWidth - 150, align: "right" });
    y += 16;
    doc.font("Inter").fontSize(9.5).fillColor(GRAY).text("Government Fee Amount", totalsX, y, { width: 150 });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(govFee), totalsX + 150, y, { width: totalsWidth - 150, align: "right" });
    y += 16;
  }
  doc.font("Inter").fontSize(9.5).fillColor(GRAY).text("Amount", totalsX, y, { width: 150 });
  doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(amount), totalsX + 150, y, { width: totalsWidth - 150, align: "right" });
  y += 16;
  doc.font("Inter").fontSize(9.5).fillColor(GRAY).text("Paid", totalsX, y, { width: 150 });
  doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(paid), totalsX + 150, y, { width: totalsWidth - 150, align: "right" });
  y += 16;
  doc.rect(totalsX, y - 2, totalsWidth, 22).fill(LIGHT_BG);
  doc.font("Inter-SemiBold").fontSize(11).fillColor(INK).text("Balance Due", totalsX + 6, y + 4, { width: 144 });
  doc.font("Inter-Bold").fontSize(11).text(`QAR ${money2(balance)}`, totalsX + 150, y + 4, { width: totalsWidth - 156, align: "right" });
  y += 36;

  if (isMixed) {
    doc.font("Inter").fontSize(8).fillColor(GRAY)
      .text("The Government Fee portion is a pass-through charge — excluded from Address Gateway's business volume and incentive calculations.", MARGIN, y, { width: tableRight - MARGIN });
    y = doc.y + 14;
  }

  doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
  y += 16;
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Status :", MARGIN, y);
  doc.font("Inter").fontSize(9).fillColor(INK).text(invoice.status || "Sent", MARGIN + 90, y);
  y = doc.y + 20;

  if (payments.length) {
    doc.font("Inter-SemiBold").fontSize(11).fillColor(INK).text("Payment History", MARGIN, y);
    y = doc.y + 10;
    const colX = { date: MARGIN, amount: MARGIN + 130, mode: MARGIN + 260 };
    doc.rect(MARGIN, y, tableRight - MARGIN, 20).fill("#2A2E33");
    doc.font("Inter-SemiBold").fontSize(9).fillColor("#FFFFFF");
    doc.text("Date", colX.date + 5, y + 6);
    doc.text("Amount", colX.amount, y + 6);
    doc.text("Mode", colX.mode, y + 6);
    doc.fillColor(INK);
    y += 20;
    payments.forEach((p) => {
      doc.font("Inter").fontSize(9).fillColor(INK).text(fmtDate(p.paid_at || p.date), colX.date + 5, y + 6);
      doc.text(money2(p.amount), colX.amount, y + 6);
      doc.text(p.mode || "-", colX.mode, y + 6);
      y += 20;
      doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
    });
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (invoice.internalOnly) drawWatermark(doc, "INTERNAL USE ONLY");
    doc.font("Inter").fontSize(7).fillColor(GRAY)
      .text(FOOTER_NOTE, MARGIN, doc.page.height - MARGIN - 24, { width: doc.page.width - MARGIN * 2, align: "center" });
    doc.fillColor(INK);
  }

  doc.end();
}

module.exports = { generateInvoicePdf };
