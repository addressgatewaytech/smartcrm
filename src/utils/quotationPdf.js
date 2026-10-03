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

// Visual language shared by the table header, each fee-type block and the totals summary below —
// a bordered, rounded "card" (PDFKit has no CSS border-radius/overflow:hidden, so a rounded clip
// region stands in for the fill and a plain roundedRect().stroke() draws the border on top) —
// matching the on-screen doc-paper preview's QuoteItemsCard/QuoteTotalsCard (frontend/src/App.jsx)
// so the real downloaded PDF never looks flatter than what staff see while editing.
const CARD_RADIUS = 8;
const CARD_GAP = 10;
const HEADER_H = 22;

function drawCardBorder(doc, x, top, w, h) {
  doc.roundedRect(x, top, w, h, CARD_RADIUS).lineWidth(0.8).strokeColor(HAIR).stroke();
}

function drawTableHeader(doc, y, colX, tableRight, headerBg) {
  const w = tableRight - MARGIN;
  doc.save();
  doc.roundedRect(MARGIN, y, w, HEADER_H, CARD_RADIUS).clip();
  doc.rect(MARGIN, y, w, HEADER_H).fill(headerBg || DARK_BG);
  doc.restore();
  drawCardBorder(doc, MARGIN, y, w, HEADER_H);
  doc.font("Inter-SemiBold").fontSize(9).fillColor("#FFFFFF");
  doc.text("#", colX.idx + 5, y + 7, { width: colX.desc - colX.idx - 10 });
  doc.text("Item & Description", colX.desc, y + 7, { width: colX.rate - colX.desc - 5 });
  doc.text("Rate", colX.rate, y + 7, { width: colX.amount - colX.rate - 5, align: "right" });
  doc.text("Amount", colX.amount, y + 7, { width: tableRight - colX.amount - 5, align: "right" });
  doc.fillColor(INK);
  return y + HEADER_H;
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

  // --- Line items table, grouped into bordered rounded "cards" by contiguous fee-type run -------
  // (normally exactly two: Government Fee, then Professional Fee) — mirrors the on-screen
  // doc-paper preview's QuoteItemsCard so the real PDF and what staff see while editing can never
  // visually diverge. Every section after the table just needs a plain page break (no header
  // redraw) — see ensureRoom below.
  const ensureRoom = (needed) => {
    if (y + needed > doc.page.height - MARGIN - 40) {
      doc.addPage();
      y = MARGIN;
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

  const descWidth = colX.rate - colX.desc - 5;
  const measureItemHeight = (it) => {
    const descText = it.description || it.service || "";
    const descHeight = doc.font("Inter").fontSize(9.5).heightOfString(descText, { width: descWidth });
    const noteHeight = it.note ? doc.font("Inter").fontSize(8).heightOfString(it.note, { width: descWidth }) + 3 : 0;
    return Math.max(18, descHeight + noteHeight + 8);
  };
  const measureCategoryHeight = (label) => doc.font("Inter-SemiBold").fontSize(9.5).heightOfString(label, { width: tableRight - MARGIN }) + 10;

  let rowNumber = 0;
  const renderRowBody = (r, ry) => {
    if (r.kind === "category") {
      doc.font("Inter-SemiBold").fontSize(9.5).fillColor(INK).text(r.label, MARGIN, ry + 6, { width: tableRight - MARGIN });
      return;
    }
    rowNumber++;
    const it = r.it;
    const descText = it.description || it.service || "";
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(String(rowNumber), colX.idx + 5, ry + 6, { width: colX.desc - colX.idx - 10 });
    doc.text(descText, colX.desc, ry + 6, { width: descWidth });
    if (it.note) {
      doc.font("Inter").fontSize(8).fillColor(GRAY).text(it.note, colX.desc, doc.y + 1, { width: descWidth });
    }
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(it.price), colX.rate, ry + 6, { width: colX.amount - colX.rate - 5, align: "right" });
    const lineAmount = (Number(it.qty) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discountPct) || 0) / 100);
    doc.text(money2(lineAmount), colX.amount, ry + 6, { width: tableRight - colX.amount - 5, align: "right" });
  };

  // Build one block per contiguous run of same fee-type, each row pre-measured so its card's
  // total height is known before anything is drawn.
  const blocks = [];
  let lastCategory = null;
  items.forEach((it) => {
    const isGov = isGovFeeItem(it);
    if (!blocks.length || blocks[blocks.length - 1].isGov !== isGov) {
      blocks.push({ isGov, rows: [] });
      lastCategory = null;
    }
    const block = blocks[blocks.length - 1];
    if ((it.category || "") && it.category !== lastCategory) {
      block.rows.push({ kind: "category", label: it.category, height: measureCategoryHeight(it.category) });
      lastCategory = it.category;
    }
    block.rows.push({ kind: "item", it, height: measureItemHeight(it) });
  });

  y = drawTableHeader(doc, y, colX, tableRight, theme.headerBg) + CARD_GAP;
  const maxCardHeight = doc.page.height - MARGIN * 2 - 40 - HEADER_H - CARD_GAP;

  blocks.forEach((block) => {
    const blockHeight = block.rows.reduce((a, r) => a + r.height, 0);
    const bg = block.isGov ? GOV_FEE_BG : PROF_FEE_BG;

    if (blockHeight <= maxCardHeight) {
      // The whole card fits on one page — break first (redrawing the column header) so the card
      // itself is never sliced in half by a page boundary.
      if (y + blockHeight > doc.page.height - MARGIN - 40) {
        doc.addPage();
        y = drawTableHeader(doc, MARGIN, colX, tableRight, theme.headerBg) + CARD_GAP;
      }
      const cardTop = y;
      doc.save();
      doc.roundedRect(MARGIN, cardTop, tableRight - MARGIN, blockHeight, CARD_RADIUS).clip();
      let ry = cardTop;
      block.rows.forEach((r) => {
        doc.rect(MARGIN, ry, tableRight - MARGIN, r.height).fill(bg);
        if (ry > cardTop) doc.moveTo(MARGIN, ry).lineTo(tableRight, ry).strokeColor(HAIR).stroke();
        renderRowBody(r, ry);
        ry += r.height;
      });
      doc.restore();
      drawCardBorder(doc, MARGIN, cardTop, tableRight - MARGIN, blockHeight);
      y = cardTop + blockHeight + CARD_GAP;
    } else {
      // Rare: a single fee-type block too tall for any one page — fall back to plain flat rows
      // rather than draw a card border that would have to be sliced across a page break.
      block.rows.forEach((r) => {
        if (y + r.height > doc.page.height - MARGIN - 40) {
          doc.addPage();
          y = drawTableHeader(doc, MARGIN, colX, tableRight, theme.headerBg) + CARD_GAP;
        }
        doc.rect(MARGIN, y, tableRight - MARGIN, r.height).fill(bg);
        renderRowBody(r, y);
        y += r.height;
        doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
      });
      y += CARD_GAP;
    }
  });
  y += 6;

  // --- Government Fee Total / Professional Fee Total / Sub Total / Discount / Total, as one
  // bordered rounded card (mirrors QuoteTotalsCard) with the Total row as a full-width colored
  // strip clipped to the card's own rounded bottom corners. Pre-discount split is ordered to
  // match whichever classification actually appears first among the items — so reordering the
  // line items also reorders the two totals underneath them. -------------------------------------
  const govFeeTotal = items.filter(isGovFeeItem).reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0) * (1 - (Number(it.discountPct) || 0) / 100), 0);
  const profFeeTotal = subtotal - govFeeTotal;
  const firstGovIdx = items.findIndex(isGovFeeItem);
  const firstProfIdx = items.findIndex((it) => !isGovFeeItem(it));
  const govFirst = firstGovIdx !== -1 && (firstProfIdx === -1 || firstGovIdx < firstProfIdx);

  const totalsWidth = 240;
  const totalsX = tableRight - totalsWidth;
  const LINE_H = 16;
  const STRIP_H = 24;
  const PAD_V = 6;
  const PAD_H = 8;
  const labelWidth = 118; // fits "Government Fee Total" / "Professional Fee Total" on one line at 9.5pt
  const valueX = totalsX + PAD_H + labelWidth;
  const valueWidth = totalsWidth - PAD_H * 2 - labelWidth;
  let totalsLineCount = 1; // Sub Total is always shown
  if (govFeeTotal > 0 && profFeeTotal > 0) totalsLineCount += 2;
  if (itemDiscountTotal > 0) totalsLineCount += 1;
  if (discountAmount > 0) totalsLineCount += 1;
  const totalsBoxHeight = PAD_V * 2 + totalsLineCount * LINE_H + STRIP_H;

  ensureRoom(totalsBoxHeight + 20);
  const boxTop = y;
  const stripTop = boxTop + totalsBoxHeight - STRIP_H;

  doc.save();
  doc.roundedRect(totalsX, boxTop, totalsWidth, totalsBoxHeight, CARD_RADIUS).clip();
  doc.rect(totalsX, stripTop, totalsWidth, STRIP_H).fill(theme.totalBg);
  doc.restore();
  drawCardBorder(doc, totalsX, boxTop, totalsWidth, totalsBoxHeight);

  let ty = boxTop + PAD_V;
  const drawFeeTotalLine = (label, amount) => {
    doc.font("Inter").fontSize(9.5).fillColor(GRAY).text(label, totalsX + PAD_H, ty, { width: labelWidth, lineBreak: false });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(amount), valueX, ty, { width: valueWidth, align: "right" });
    ty += LINE_H;
  };
  if (govFeeTotal > 0 && profFeeTotal > 0) {
    if (govFirst) { drawFeeTotalLine("Government Fee Total", govFeeTotal); drawFeeTotalLine("Professional Fee Total", profFeeTotal); }
    else { drawFeeTotalLine("Professional Fee Total", profFeeTotal); drawFeeTotalLine("Government Fee Total", govFeeTotal); }
  }
  if (itemDiscountTotal > 0) {
    doc.font("Inter").fontSize(9.5).fillColor(GRAY).text("Item Discount", totalsX + PAD_H, ty, { width: labelWidth, lineBreak: false });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(`(-) ${money2(itemDiscountTotal)}`, valueX, ty, { width: valueWidth, align: "right" });
    ty += LINE_H;
  }
  doc.font("Inter").fontSize(9.5).fillColor(GRAY).text("Sub Total", totalsX + PAD_H, ty, { width: labelWidth, lineBreak: false });
  doc.font("Inter").fontSize(9.5).fillColor(INK).text(money2(subtotal), valueX, ty, { width: valueWidth, align: "right" });
  ty += LINE_H;
  if (discountAmount > 0) {
    const label = orderDiscountType === "percent" ? `Discount (${money2(orderDiscount)}%)` : "Discount";
    doc.font("Inter").fontSize(9.5).fillColor(GRAY).text(label, totalsX + PAD_H, ty, { width: labelWidth, lineBreak: false });
    doc.font("Inter").fontSize(9.5).fillColor(INK).text(`(-) ${money2(discountAmount)}`, valueX, ty, { width: valueWidth, align: "right" });
    ty += LINE_H;
  }
  doc.font("Inter-SemiBold").fontSize(10.5).fillColor(theme.totalText).text("Total", totalsX + PAD_H, stripTop + 7, { width: labelWidth, lineBreak: false });
  doc.font("Inter-Bold").fontSize(10.5).text(`QAR ${money2(total)}`, valueX, stripTop + 7, { width: valueWidth, align: "right" });
  y = boxTop + totalsBoxHeight + 24;

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
