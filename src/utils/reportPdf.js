// Generic tabular report -> PDF, reusing the same brand header/fonts as the document PDFs
// (quotationPdf.js etc. via pdfCommon.js) so every PDF the app produces looks consistent. One
// function serves every new report (Employee Tasks, Lead Performance, Attendance, ...) rather
// than writing bespoke layout code per report.
const PDFDocument = require("pdfkit");
const { MARGIN, GRAY, INK, DARK_BG, HAIR, registerFonts, fmtDate, drawBrandHeader } = require("./pdfCommon");

/**
 * @param {{ title: string, subtitle?: string, columns: {key:string, label:string, width?:number, align?:'left'|'right'}[], rows: object[] }} report
 * @param {import('express').Response} res
 */
function generateTablePdf({ title, subtitle, columns, rows }, res) {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${title.replace(/[^a-z0-9]+/gi, "-")}.pdf"`);
  doc.pipe(res);

  const tableRight = doc.page.width - MARGIN;
  const headerTop = MARGIN;
  doc.font("Inter-Bold").fontSize(22).fillColor(INK).text(title, MARGIN, headerTop, { lineBreak: false });
  if (subtitle) doc.font("Inter").fontSize(9).fillColor(GRAY).text(subtitle, MARGIN, headerTop + 28, { lineBreak: false });
  const brandBottomY = drawBrandHeader(doc, tableRight, headerTop);
  let y = Math.max(headerTop + (subtitle ? 44 : 34), brandBottomY) + 16;

  // Even column widths unless explicitly given.
  const given = columns.reduce((a, c) => a + (c.width || 0), 0);
  const remaining = tableRight - MARGIN - given;
  const autoCols = columns.filter((c) => !c.width).length || 1;
  const autoWidth = Math.max(60, remaining / autoCols);
  let x = MARGIN;
  const colX = columns.map((c) => {
    const w = c.width || autoWidth;
    const cx = { x, w, align: c.align || "left" };
    x += w;
    return cx;
  });

  const rowHeight = 18;
  const drawHeader = () => {
    doc.rect(MARGIN, y, tableRight - MARGIN, rowHeight + 2).fill(DARK_BG);
    doc.font("Inter-SemiBold").fontSize(8.5).fillColor("#FFFFFF");
    columns.forEach((c, i) => doc.text(c.label, colX[i].x + 4, y + 6, { width: colX[i].w - 8, align: colX[i].align }));
    doc.fillColor(INK);
    y += rowHeight + 2;
  };
  const ensureRoom = () => {
    if (y + rowHeight > doc.page.height - MARGIN - 30) {
      doc.addPage();
      y = MARGIN;
      drawHeader();
    }
  };

  drawHeader();
  rows.forEach((r, i) => {
    ensureRoom();
    if (i % 2 === 1) doc.rect(MARGIN, y, tableRight - MARGIN, rowHeight).fill(HAIR);
    doc.fillColor(INK).font("Inter").fontSize(8.5);
    columns.forEach((c, ci) => {
      const raw = r[c.key];
      const val = raw instanceof Date ? fmtDate(raw) : raw == null ? "" : String(raw);
      doc.text(val, colX[ci].x + 4, y + 5, { width: colX[ci].w - 8, align: colX[ci].align });
    });
    y += rowHeight;
    doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(HAIR).stroke();
  });

  if (!rows.length) {
    doc.font("Inter").fontSize(9).fillColor(GRAY).text("No data for this range.", MARGIN, y + 8);
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Inter").fontSize(7).fillColor(GRAY)
      .text(`Generated ${fmtDate(new Date().toISOString().slice(0, 10))}`, MARGIN, doc.page.height - MARGIN - 16, { width: doc.page.width - MARGIN * 2, align: "center" });
  }

  doc.end();
}

module.exports = { generateTablePdf };
