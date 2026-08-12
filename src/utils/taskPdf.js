// Task documentation PDF — full details, the Content Production tracker if this task has one, and
// the complete activity log (status changes, content-stage completions, comments), for handover/
// record-keeping. Uses the real brand header (logo + address block) from pdfCommon.js, same as
// Invoice/Sales Order/Report PDFs.
const PDFDocument = require("pdfkit");
const { MARGIN, GRAY, INK, DARK_BG, HAIR, registerFonts, fmtDate, drawBrandHeader } = require("./pdfCommon");
const { CONTENT_STAGES } = require("./contentStages");

/**
 * @param {object} task - tasks row plus assigneeName (string), statusLog (array of {status, by_user, byName, note, at}), contentStages (array of {stage_index, target_date, completed_at, completed_by})
 * @param {import('express').Response} res
 */
function generateTaskPdf(task, res) {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Task-${task.id}.pdf"`);
  doc.pipe(res);

  const right = doc.page.width - MARGIN;
  const headerTop = MARGIN;
  doc.font("Inter-Bold").fontSize(20).fillColor(INK).text(task.id, MARGIN, headerTop, { lineBreak: false });
  doc.font("Inter").fontSize(10).fillColor(GRAY).text(task.title, MARGIN, headerTop + 26, { width: right - MARGIN - 170 });
  const bodyTopY = Math.max(doc.y, drawBrandHeader(doc, right, headerTop)) + 16;
  let y = bodyTopY;

  const ensureRoom = (needed) => {
    if (y + needed > doc.page.height - MARGIN - 30) { doc.addPage(); y = MARGIN; }
  };

  const field = (label, value) => {
    ensureRoom(16);
    doc.font("Inter-SemiBold").fontSize(9).fillColor(GRAY).text(label, MARGIN, y, { continued: true, width: 120 });
    doc.font("Inter").fontSize(9).fillColor(INK).text(`  ${value || "—"}`);
    y = doc.y + 4;
  };

  field("Status", task.status);
  field("Priority", task.priority);
  field("Assigned to", task.assigneeName || "Unassigned");
  field("Department", task.department);
  field("Due date", fmtDate(task.due_date));
  field("Progress", `${task.progress_pct ?? 0}%`);
  field("Created", fmtDate(task.created_at));
  if (task.description) field("Description", task.description);
  if (task.rejection_reason) field("Rejection reason", task.rejection_reason);
  y += 6;

  if ((task.contentStages || []).length) {
    ensureRoom(20);
    doc.font("Inter-SemiBold").fontSize(11).fillColor(INK).text("Content Production", MARGIN, y);
    y = doc.y + 6;
    const stages = [...task.contentStages].sort((a, b) => a.stage_index - b.stage_index);
    stages.forEach((s) => {
      const name = CONTENT_STAGES[s.stage_index] || `Stage ${s.stage_index + 1}`;
      const done = !!s.completed_at;
      let statusText = done ? `Done ${fmtDate(s.completed_at)}` : "Pending";
      if (done && s.target_date) {
        const onTime = String(s.completed_at).slice(0, 10) <= String(s.target_date).slice(0, 10);
        statusText += onTime ? " (On time)" : " (Late)";
      } else if (!done && s.target_date) {
        statusText += ` — target ${fmtDate(s.target_date)}`;
      }
      const line = `${done ? "[x]" : "[ ]"} ${s.stage_index + 1}. ${name} — ${statusText}`;
      const height = doc.font("Inter").fontSize(9.5).heightOfString(line, { width: right - MARGIN });
      ensureRoom(height + 6);
      doc.font("Inter").fontSize(9.5).fillColor(done ? GRAY : INK).text(line, MARGIN, y, { width: right - MARGIN });
      y = doc.y + 3;
    });
    y += 10;
  }

  ensureRoom(24);
  doc.rect(MARGIN, y, right - MARGIN, 20).fill(DARK_BG);
  doc.font("Inter-SemiBold").fontSize(9.5).fillColor("#FFFFFF").text("Activity Log", MARGIN + 6, y + 6);
  doc.fillColor(INK);
  y += 26;

  const log = [...(task.statusLog || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!log.length) {
    doc.font("Inter").fontSize(9).fillColor(GRAY).text("No activity recorded.", MARGIN, y);
    y = doc.y + 6;
  } else {
    log.forEach((l) => {
      const text = l.note || l.status;
      const height = doc.font("Inter").fontSize(9.5).heightOfString(text, { width: right - MARGIN });
      ensureRoom(height + 16);
      doc.font("Inter-SemiBold").fontSize(8).fillColor(GRAY).text(`${fmtDate(l.at)} — ${l.byName || "System"}`, MARGIN, y);
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

module.exports = { generateTaskPdf };
