// Shared PDFKit drawing helpers for Sales Order / Invoice PDFs — mirrors the brand header/fonts
// used by quotationPdf.js (kept as a separate copy rather than refactoring that file, since the
// quotation PDF is a live, already-verified production feature that shouldn't be touched here).
const path = require("path");

const MARGIN = 40;
const GRAY = "#6b7178";
const INK = "#151A1F";
const DARK_BG = "#2A2E33";
const HAIR = "#E1E6E8";
const LIGHT_BG = "#F5F6F6";

const FONTS_DIR = path.join(__dirname, "../assets/fonts");
const LOGO_PATH = path.join(__dirname, "../../frontend/public/logo-address-gateway.png");
const LOGO_ASPECT = 1410 / 613;

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

/** Draws the real brand logo + address block, right-aligned, at (rightX, y). Returns the y after it. */
function drawBrandHeader(doc, rightX, y) {
  const logoHeight = 34;
  const logoWidth = logoHeight * LOGO_ASPECT;
  doc.image(LOGO_PATH, rightX - logoWidth, y, { height: logoHeight });
  y += logoHeight + 6;
  doc.font("Inter").fontSize(9).fillColor(GRAY)
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

/** Draws the customer name (bold), right-aligned to match the "Bill To" block. Returns the y after it. */
function drawBillTo(doc, customerName, rightX, y) {
  doc.font("Inter-SemiBold").fontSize(10.5).fillColor(INK).text(customerName || "", MARGIN, y, { width: rightX - MARGIN, align: "right" });
  const bottom = doc.y;
  doc.fillColor(INK);
  return bottom;
}

/** Draws a quotation-style line-item table (grouped by category, dark header row) starting at y.
 * Simple top-to-bottom flow with page breaks (no re-drawn header on overflow) — fine for the
 * short Sales Order / Invoice documents this is used for. Returns { y, subtotal }. */
function drawItemsTable(doc, items, y, tableRight) {
  const colX = { idx: MARGIN, desc: MARGIN + 25, rate: MARGIN + 340, amount: MARGIN + 430 };
  const ensureRoom = (needed) => {
    if (y + needed > doc.page.height - MARGIN - 40) {
      doc.addPage();
      y = MARGIN;
    }
  };

  doc.rect(MARGIN, y, tableRight - MARGIN, 22).fill(DARK_BG);
  doc.font("Inter-SemiBold").fontSize(9).fillColor("#FFFFFF");
  doc.text("#", colX.idx + 5, y + 7, { width: colX.desc - colX.idx - 10 });
  doc.text("Item & Description", colX.desc, y + 7, { width: colX.rate - colX.desc - 5 });
  doc.text("Rate", colX.rate, y + 7, { width: colX.amount - colX.rate - 5, align: "right" });
  doc.text("Amount", colX.amount, y + 7, { width: tableRight - colX.amount - 5, align: "right" });
  doc.fillColor(INK);
  y += 22;

  let lastCategory = null;
  let rowNumber = 0;
  let subtotal = 0;
  items.forEach((it) => {
    if ((it.category || "") && it.category !== lastCategory) {
      ensureRoom(20);
      doc.font("Inter-SemiBold").fontSize(9.5).fillColor(INK).text(it.category, MARGIN, y + 6, { width: tableRight - MARGIN });
      y = doc.y + 4;
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

    ensureRoom(rowHeight);
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(String(rowNumber), colX.idx + 5, y + 6, { width: colX.desc - colX.idx - 10 });
    doc.text(descText, colX.desc, y + 6, { width: descWidth });
    if (it.note) {
      doc.font("Inter").fontSize(8).fillColor(GRAY).text(it.note, colX.desc, doc.y + 1, { width: descWidth });
    }
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(it.price), colX.rate, y + 6, { width: colX.amount - colX.rate - 5, align: "right" });
    const lineAmount = (Number(it.qty) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discountPct) || 0) / 100);
    subtotal += lineAmount;
    doc.text(money2(lineAmount), colX.amount, y + 6, { width: tableRight - colX.amount - 5, align: "right" });
    y += rowHeight;
    doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
  });
  return { y: y + 12, subtotal };
}

module.exports = {
  MARGIN, GRAY, INK, DARK_BG, HAIR, LIGHT_BG,
  registerFonts, money2, fmtDate, drawBrandHeader, drawBillTo, drawItemsTable,
};
