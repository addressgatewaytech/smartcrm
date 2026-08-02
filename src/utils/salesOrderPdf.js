// Server-side A4 PDF for a Sales Order — same PDFKit approach and brand header as quotationPdf.js.
const PDFDocument = require("pdfkit");
const { MARGIN, GRAY, INK, HAIR, LIGHT_BG, registerFonts, money2, fmtDate, drawBrandHeader, drawBillTo, drawItemsTable, drawWatermark } = require("./pdfCommon");

const FOOTER_NOTE = "This document confirms the sales order raised from an accepted quotation.";

/** Streams a real A4 PDF for `salesOrder` directly to `res`. */
function generateSalesOrderPdf(salesOrder, res) {
  const amount = Number(salesOrder.amount || 0);
  const profFee = Number(salesOrder.professional_fee_amount ?? amount);
  const govFee = Math.max(0, amount - profFee);
  const orderDiscount = Number(salesOrder.order_discount || 0);
  const isMixed = govFee > 0.005 && profFee > 0.005;
  const feeTypeLabel = isMixed ? "Professional + Government Fee" : (salesOrder.fee_type || "Professional Fee");

  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="SalesOrder-${salesOrder.id}.pdf"`);
  doc.pipe(res);

  const tableRight = doc.page.width - MARGIN;

  const headerTop = MARGIN;
  doc.font("Inter-Bold").fontSize(28).fillColor(INK).text("SALES ORDER", MARGIN, headerTop, { lineBreak: false });
  doc.font("Inter").fontSize(9).fillColor(GRAY).text(`Order# ${salesOrder.id}`, MARGIN, headerTop + 32, { lineBreak: false });
  const brandBottomY = drawBrandHeader(doc, tableRight, headerTop);
  let y = Math.max(headerTop + 48, brandBottomY) + 20;

  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Order Date :", MARGIN, y);
  doc.font("Inter").fontSize(9).fillColor(INK).text(fmtDate(salesOrder.created_at) || "-", MARGIN + 80, y);
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Bill To", MARGIN, y, { width: tableRight - MARGIN, align: "right" });
  const billToBottomY = drawBillTo(doc, salesOrder.customer, tableRight, doc.y + 2);
  y = Math.max(y + 14, billToBottomY) + 20;

  if (salesOrder.quotation_id) {
    doc.font("Inter").fontSize(9).fillColor(GRAY).text("Quotation Ref :", MARGIN, y);
    doc.font("Inter").fontSize(9).fillColor(INK).text(salesOrder.quotation_id, MARGIN + 90, y);
    y = doc.y + 10;
  }
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Service :", MARGIN, y);
  doc.font("Inter").fontSize(9).fillColor(INK).text(salesOrder.service || "-", MARGIN + 90, y);
  y = doc.y + 10;
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Fee Type :", MARGIN, y);
  doc.font("Inter").fontSize(9).fillColor(INK).text(feeTypeLabel, MARGIN + 90, y);
  y = doc.y + 20;

  const items = salesOrder.items || [];
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
  if (orderDiscount > 0) {
    doc.font("Inter").fontSize(9.5).fillColor(GRAY).text("Order Discount", totalsX, y, { width: 150 });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(`(-) ${money2(orderDiscount)}`, totalsX + 150, y, { width: totalsWidth - 150, align: "right" });
    y += 16;
  }
  doc.rect(totalsX, y - 2, totalsWidth, 22).fill(LIGHT_BG);
  doc.font("Inter-SemiBold").fontSize(11).fillColor(INK).text("Total Amount", totalsX + 6, y + 4, { width: 144 });
  doc.font("Inter-Bold").fontSize(11).text(`QAR ${money2(amount)}`, totalsX + 150, y + 4, { width: totalsWidth - 156, align: "right" });
  y += 36;

  if (isMixed) {
    doc.font("Inter").fontSize(8).fillColor(GRAY)
      .text("The Government Fee portion is a pass-through charge — excluded from Address Gateway's business volume and incentive calculations.", MARGIN, y, { width: tableRight - MARGIN });
    y = doc.y + 14;
  }

  doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
  y += 16;
  doc.font("Inter").fontSize(9).fillColor(GRAY).text("Status :", MARGIN, y);
  doc.font("Inter").fontSize(9).fillColor(INK).text(salesOrder.onboarded ? "Onboarded" : "Pending onboarding", MARGIN + 90, y);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (salesOrder.internalOnly) drawWatermark(doc, "INTERNAL USE ONLY");
    doc.font("Inter").fontSize(7).fillColor(GRAY)
      .text(FOOTER_NOTE, MARGIN, doc.page.height - MARGIN - 24, { width: doc.page.width - MARGIN * 2, align: "center" });
    doc.fillColor(INK);
  }

  doc.end();
}

module.exports = { generateSalesOrderPdf };
