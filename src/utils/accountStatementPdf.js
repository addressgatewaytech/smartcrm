// Customer Account Statement — branded PDF listing every invoice, payment, and the running
// balance. Reuses the same brand fonts/colors as every other document PDF (pdfCommon.js), but
// flips which logo leads: this is a Smart CRM report generated on Address Gateway's behalf, so
// the Smart CRM mark is the primary header logo and Address Gateway appears in a "Powered by"
// badge — the opposite emphasis from the client-facing Onboarding Form PDF.
const path = require("path");
const PDFDocument = require("pdfkit");
const { MARGIN, GRAY, INK, HAIR, registerFonts, money2, fmtDate } = require("./pdfCommon");

const ACCENT = "#0D7288";
const ACCENT_TINT = "#E1F2F5";
const DARK_BADGE = "#1B2028";

const SMARTCRM_LOGO_PATH = path.join(__dirname, "../../frontend/public/logo-smart-crm.png");
const SMARTCRM_ASPECT = 294 / 157;
const AGW_LOGO_PATH = path.join(__dirname, "../../frontend/public/logo-address-gateway.png");
const AGW_ASPECT = 1410 / 613;

/** Smart CRM wordmark, prominent, right-aligned — the primary mark on this document. Dark
 * pill backing since the source PNG is a white-on-transparent mark. */
function drawSmartCrmHeader(doc, rightX, y) {
  const logoH = 34;
  const logoW = logoH * SMARTCRM_ASPECT;
  const padX = 14, padY = 8;
  const boxW = logoW + padX * 2, boxH = logoH + padY * 2;
  doc.roundedRect(rightX - boxW, y, boxW, boxH, 6).fill(DARK_BADGE);
  doc.image(SMARTCRM_LOGO_PATH, rightX - boxW + padX, y + padY, { height: logoH });
  return y + boxH;
}

/** "Powered by Address Gateway" badge, top-left. */
function drawPoweredByAddressGateway(doc, x, y) {
  doc.font("Inter").fontSize(7).fillColor(GRAY).text("POWERED BY", x, y, { characterSpacing: 0.6 });
  const logoY = doc.y + 4;
  const logoH = 20;
  const logoW = logoH * AGW_ASPECT;
  doc.image(AGW_LOGO_PATH, x, logoY, { height: logoH });
  doc.fillColor(INK);
  return logoY + logoH;
}

/**
 * @param {object} customer - { id, name }
 * @param {object[]} invoices - invoice rows plus `.payments` (array) and `.service` (resolved)
 * @param {{ totalInvoiced:number, totalPaid:number, balance:number }} statement
 * @param {import('express').Response} res
 */
function generateAccountStatementPdf(customer, invoices, statement, res) {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Statement-${customer.id}.pdf"`);
  doc.pipe(res);

  const right = doc.page.width - MARGIN;
  const width = right - MARGIN;
  let y = MARGIN;

  const badgeBottom = drawPoweredByAddressGateway(doc, MARGIN, y);
  const logoBottom = drawSmartCrmHeader(doc, right, y);
  y = Math.max(badgeBottom, logoBottom) + 14;

  doc.moveTo(MARGIN, y).lineTo(right, y).strokeColor(ACCENT).lineWidth(2).stroke();
  y += 14;

  doc.font("Inter-Bold").fontSize(20).fillColor(INK).text("ACCOUNT STATEMENT", MARGIN, y);
  y = doc.y + 10;

  doc.rect(MARGIN, y, width, 34).fill(ACCENT_TINT);
  doc.font("Inter-SemiBold").fontSize(11).fillColor(INK).text(customer.name || "", MARGIN + 10, y + 6, { width: width / 2 });
  doc.font("Inter").fontSize(8).fillColor(GRAY)
    .text(`Customer ID: ${customer.id}`, MARGIN + width / 2, y + 6, { width: width / 2 - 10, align: "right" });
  doc.text(`Generated: ${fmtDate(new Date().toISOString().slice(0, 10))}`, MARGIN + width / 2, y + 19, { width: width / 2 - 10, align: "right" });
  doc.fillColor(INK);
  y += 50;

  const ensureRoom = (needed) => {
    if (y + needed > doc.page.height - MARGIN - 30) { doc.addPage(); y = MARGIN; }
  };

  // Summary strip
  const sumColW = width / 3;
  const summaryBox = (label, value, x, tone) => {
    doc.font("Inter").fontSize(8).fillColor(GRAY).text(label.toUpperCase(), x, y, { width: sumColW, characterSpacing: 0.4 });
    doc.font("Inter-Bold").fontSize(14).fillColor(tone).text(`QAR ${money2(value)}`, x, doc.y + 2, { width: sumColW });
  };
  summaryBox("Total Invoiced", statement.totalInvoiced, MARGIN, INK);
  summaryBox("Total Paid", statement.totalPaid, MARGIN + sumColW, "#1E8E5A");
  summaryBox("Balance Due", statement.balance, MARGIN + sumColW * 2, statement.balance > 0 ? "#C0392B" : "#1E8E5A");
  y = doc.y + 20;

  // Invoice table
  ensureRoom(24);
  const col = { id: MARGIN, date: MARGIN + 90, service: MARGIN + 160, amt: MARGIN + 340, paid: MARGIN + 400, bal: MARGIN + 460 };
  const drawTableHeader = () => {
    doc.rect(MARGIN, y, width, 20).fill(INK);
    doc.font("Inter-SemiBold").fontSize(8).fillColor("#FFFFFF");
    doc.text("Invoice", col.id + 5, y + 6);
    doc.text("Date", col.date, y + 6);
    doc.text("Service", col.service, y + 6, { width: col.amt - col.service - 5 });
    doc.text("Amount", col.amt, y + 6, { width: col.paid - col.amt - 5, align: "right" });
    doc.text("Paid", col.paid, y + 6, { width: col.bal - col.paid - 5, align: "right" });
    doc.text("Balance", col.bal, y + 6, { width: right - col.bal - 5, align: "right" });
    doc.fillColor(INK);
    y += 20;
  };
  drawTableHeader();

  if (!invoices.length) {
    doc.font("Inter").fontSize(9).fillColor(GRAY).text("No invoices on file for this customer.", MARGIN, y + 8);
    y = doc.y + 8;
  }

  invoices.forEach((inv, i) => {
    const paid = (inv.payments || []).reduce((a, p) => a + Number(p.amount), 0);
    const balance = Number(inv.amount) - paid;
    const serviceWidth = col.amt - col.service - 5;
    const serviceHeight = doc.font("Inter").fontSize(8.5).heightOfString(inv.service || "—", { width: serviceWidth });
    const rowHeight = Math.max(18, serviceHeight + 10);
    ensureRoom(rowHeight);
    if (i % 2 === 1) doc.rect(MARGIN, y, width, rowHeight).fill("#F5F6F6");
    doc.font("Inter").fontSize(8.5).fillColor(INK);
    doc.text(inv.id, col.id + 5, y + 5, { width: col.date - col.id - 5 });
    doc.text(fmtDate(inv.created_at), col.date, y + 5, { width: col.service - col.date - 5 });
    doc.fillColor(GRAY).text(inv.service || "—", col.service, y + 5, { width: serviceWidth });
    doc.fillColor(INK);
    doc.text(money2(inv.amount), col.amt, y + 5, { width: col.paid - col.amt - 5, align: "right" });
    doc.fillColor("#1E8E5A").text(money2(paid), col.paid, y + 5, { width: col.bal - col.paid - 5, align: "right" });
    doc.fillColor(balance > 0 ? "#C0392B" : "#1E8E5A").text(money2(balance), col.bal, y + 5, { width: right - col.bal - 5, align: "right" });
    doc.fillColor(INK);
    y += rowHeight;
  });

  // Totals row
  ensureRoom(26);
  doc.moveTo(MARGIN, y).lineTo(right, y).strokeColor(HAIR).stroke();
  y += 6;
  doc.font("Inter-Bold").fontSize(9.5).fillColor(INK).text("TOTAL", col.amt - 60, y, { width: 55, align: "right" });
  doc.text(money2(statement.totalInvoiced), col.amt, y, { width: col.paid - col.amt - 5, align: "right" });
  doc.fillColor("#1E8E5A").text(money2(statement.totalPaid), col.paid, y, { width: col.bal - col.paid - 5, align: "right" });
  doc.fillColor(statement.balance > 0 ? "#C0392B" : "#1E8E5A").text(money2(statement.balance), col.bal, y, { width: right - col.bal - 5, align: "right" });
  doc.fillColor(INK);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Inter").fontSize(7).fillColor(GRAY)
      .text(`Address Gateway Business Services · D Ring Road, Doha, Qatar · Page ${i - range.start + 1} of ${range.count}`,
        MARGIN, doc.page.height - MARGIN - 14, { width: doc.page.width - MARGIN * 2, align: "center" });
  }

  doc.end();
}

module.exports = { generateAccountStatementPdf };
