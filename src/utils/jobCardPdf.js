// Job Card documentation PDF — full details + complete activity log (status changes, checklist,
// assignment, comments), for handover/record-keeping. Reuses the same brand header/fonts as every
// other document PDF in this app (pdfCommon.js) so it looks consistent with Quotation/Sales
// Order/Invoice PDFs.
const PDFDocument = require("pdfkit");
const { MARGIN, GRAY, INK, DARK_BG, HAIR, registerFonts, fmtDate } = require("./pdfCommon");

/**
 * @param {object} job - job_cards row plus checklist (array), assignees (array of names), statusLog (array of {status, by, note, at})
 * @param {import('express').Response} res
 */
function generateJobCardPdf(job, res) {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="JobCard-${job.id}.pdf"`);
  doc.pipe(res);

  const right = doc.page.width - MARGIN;
  let y = MARGIN;

  doc.font("Inter-Bold").fontSize(20).fillColor(INK).text(job.id, MARGIN, y);
  y = doc.y + 4;
  doc.font("Inter").fontSize(10).fillColor(GRAY).text(`${job.customer} — ${job.service}`, MARGIN, y);
  y = doc.y + 14;

  const ensureRoom = (needed) => {
    if (y + needed > doc.page.height - MARGIN - 30) { doc.addPage(); y = MARGIN; }
  };

  const field = (label, value) => {
    ensureRoom(16);
    doc.font("Inter-SemiBold").fontSize(9).fillColor(GRAY).text(label, MARGIN, y, { continued: true, width: 120 });
    doc.font("Inter").fontSize(9).fillColor(INK).text(`  ${value || "—"}`);
    y = doc.y + 4;
  };

  field("Status", job.status);
  field("Priority", job.priority);
  field("Target date", fmtDate(job.target_date));
  field("Created", fmtDate(job.created_at));
  field("Assigned team", (job.assigneeNames || []).join(", ") || "Unassigned");
  if (job.description) field("Description", job.description);
  if (job.cancel_reason) field("Cancellation reason", job.cancel_reason);
  y += 6;

  if ((job.checklist || []).length) {
    ensureRoom(20);
    doc.font("Inter-SemiBold").fontSize(11).fillColor(INK).text("Checklist", MARGIN, y);
    y = doc.y + 6;
    job.checklist.forEach((item) => {
      ensureRoom(16);
      doc.font("Inter").fontSize(9.5).fillColor(item.done ? GRAY : INK).text(`${item.done ? "[x]" : "[ ]"} ${item.label}`, MARGIN, y);
      y = doc.y + 3;
    });
    y += 10;
  }

  ensureRoom(24);
  doc.rect(MARGIN, y, right - MARGIN, 20).fill(DARK_BG);
  doc.font("Inter-SemiBold").fontSize(9.5).fillColor("#FFFFFF").text("Activity Log", MARGIN + 6, y + 6);
  doc.fillColor(INK);
  y += 26;

  const log = [...(job.statusLog || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!log.length) {
    doc.font("Inter").fontSize(9).fillColor(GRAY).text("No activity recorded.", MARGIN, y);
    y = doc.y + 6;
  } else {
    log.forEach((l) => {
      const text = l.note || l.status;
      const height = doc.font("Inter").fontSize(9.5).heightOfString(text, { width: right - MARGIN });
      ensureRoom(height + 16);
      doc.font("Inter-SemiBold").fontSize(8).fillColor(GRAY).text(`${fmtDate(l.at)} — ${l.byName || l.by || "System"}`, MARGIN, y);
      y = doc.y + 2;
      doc.font("Inter").fontSize(9.5).fillColor(INK).text(text, MARGIN, y, { width: right - MARGIN });
      y = doc.y + 8;
      doc.moveTo(MARGIN, y - 4).lineTo(right, y - 4).strokeColor(HAIR).stroke();
    });
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Inter").fontSize(7).fillColor(GRAY)
      .text(`Generated ${fmtDate(new Date().toISOString().slice(0, 10))}`, MARGIN, doc.page.height - MARGIN - 16, { width: doc.page.width - MARGIN * 2, align: "center" });
  }

  doc.end();
}

module.exports = { generateJobCardPdf };
