// Multi-section Sales Report PDF — one brand header, a KPI summary band, an optional "By
// salesperson" breakdown table, an optional data-quality Notes block, then the full invoice-level
// detail table. Same figures the on-screen Sales Report tab shows (computed client-side, same as
// every other report — see reports.routes.js POST /sales-report-pdf), just laid out as a single
// document instead of separate CSV/Excel exports per table.
const PDFDocument = require("pdfkit");
const { MARGIN, GRAY, INK, DARK_BG, HAIR, LIGHT_BG, registerFonts, money2, fmtDate, drawBrandHeader } = require("./pdfCommon");

const money = (n) => `QAR ${money2(n)}`;
// Whole-number version for the KPI band only — those boxes are narrow (six across one row), and a
// summary tile doesn't need cents the way the line-item tables below it do.
const money0 = (n) => `QAR ${Math.round(Number(n || 0)).toLocaleString("en-US")}`;
const pct = (n) => (n == null ? "—" : `${n}%`);

/** Draws one row of bordered KPI boxes (title above, value below), evenly split across the width. */
function drawKpiBand(doc, items, y, right) {
  const gap = 8;
  const w = (right - MARGIN - gap * (items.length - 1)) / items.length;
  const h = 46;
  items.forEach((it, i) => {
    const x = MARGIN + i * (w + gap);
    doc.roundedRect(x, y, w, h, 4).fillAndStroke(LIGHT_BG, HAIR);
    // Fixed one-line label (never wraps into the value below it) + a smaller font when the value
    // itself is long, so QAR amounts never spill past the box edge.
    doc.font("Inter").fontSize(7).fillColor(GRAY).text(it.label, x + 8, y + 8, { width: w - 16, height: 9, ellipsis: true, lineBreak: false });
    const valueSize = it.value.length > 10 ? 9.5 : it.big ? 12 : 10.5;
    doc.font("Inter-Bold").fontSize(valueSize).fillColor(INK).text(it.value, x + 8, y + 23, { width: w - 16, height: 16, ellipsis: true, lineBreak: false });
  });
  return y + h + 18;
}

/** A paginated table with a dark repeated header and an optional bold TOTAL row at the end.
 * Returns the y position after the table. */
function drawTable(doc, { heading, columns, rows, totalRow }, y, right) {
  if (heading) {
    doc.font("Inter-Bold").fontSize(11.5).fillColor(INK).text(heading, MARGIN, y);
    y = doc.y + 8;
  }
  const given = columns.reduce((a, c) => a + (c.width || 0), 0);
  const autoCols = columns.filter((c) => !c.width).length || 1;
  const autoWidth = Math.max(50, (right - MARGIN - given) / autoCols);
  let cx = MARGIN;
  const colX = columns.map((c) => {
    const w = c.width || autoWidth;
    const box = { x: cx, w, align: c.align || "left" };
    cx += w;
    return box;
  });

  const rowH = 16;
  // Every cell is one clipped line, never a wrap — a table row has a fixed height, and a value too
  // long for its column (a long company name, say) silently wrapping to a second line would push
  // into the next row's separator instead of just being cut off with an ellipsis.
  const cellText = (val, box, y2, opts = {}) =>
    doc.text(val, box.x + 4, y2, { width: box.w - 8, align: box.align, height: 10, ellipsis: true, lineBreak: false, ...opts });
  const drawHead = () => {
    doc.rect(MARGIN, y, right - MARGIN, rowH + 2).fill(DARK_BG);
    doc.font("Inter-SemiBold").fontSize(7.5).fillColor("#FFFFFF");
    columns.forEach((c, i) => cellText(c.label, colX[i], y + 5));
    doc.fillColor(INK);
    y += rowH + 2;
  };
  const ensureRoom = (needed = rowH) => {
    if (y + needed > doc.page.height - MARGIN - 30) {
      doc.addPage();
      y = MARGIN;
      drawHead();
    }
  };

  drawHead();
  rows.forEach((r, i) => {
    ensureRoom();
    if (i % 2 === 1) doc.rect(MARGIN, y, right - MARGIN, rowH).fill(HAIR);
    doc.fillColor(INK).font("Inter").fontSize(7.8);
    columns.forEach((c, ci) => cellText(r[c.key] == null ? "" : String(r[c.key]), colX[ci], y + 4));
    y += rowH;
    doc.moveTo(MARGIN, y).lineTo(right, y).strokeColor(HAIR).stroke();
  });

  if (!rows.length) {
    doc.font("Inter").fontSize(8.5).fillColor(GRAY).text("Nothing in this range.", MARGIN, y + 6);
    y += 20;
  } else if (totalRow) {
    ensureRoom(rowH + 2);
    doc.rect(MARGIN, y, right - MARGIN, rowH + 2).fill(DARK_BG);
    doc.font("Inter-Bold").fontSize(7.8).fillColor("#FFFFFF");
    columns.forEach((c, ci) => cellText(totalRow[c.key] == null ? "" : String(totalRow[c.key]), colX[ci], y + 5));
    doc.fillColor(INK);
    y += rowH + 2;
  }
  return y + 16;
}

/**
 * @param {object} r
 * @param {string} r.title
 * @param {string} r.subtitle          period + scope, e.g. "This Month (1-23 Sep 2026) - All salespeople"
 * @param {{invoices:number,totalSales:number,profFee:number,collected:number,balance:number,collectedPct:number|null}} r.summary
 * @param {{name:string,invoices:number,totalSales:number,profFee:number,collected:number,balance:number,collectedPct:number|null}[]} [r.bySalesPerson]
 *        Omitted (or length <= 1) when this is already a single salesperson's own report.
 * @param {string[]} [r.notes]         auto-detected data-quality flags, shown as a bulleted block
 * @param {{id:string,date:string,customer:string,salesPerson:string,service:string,total:number,profFee:number,paid:number,balance:number,status:string}[]} r.invoices
 * @param {boolean} [r.showSalesPersonColumn]  include the Sales person column in the invoice table
 */
function generateSalesReportPdf(r, res) {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  registerFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${r.title.replace(/[^a-z0-9]+/gi, "-")}.pdf"`);
  doc.pipe(res);

  const right = doc.page.width - MARGIN;
  const top = MARGIN;
  doc.font("Inter-Bold").fontSize(20).fillColor(INK).text(r.title, MARGIN, top, { lineBreak: false });
  doc.font("Inter").fontSize(9).fillColor(GRAY).text(r.subtitle || "", MARGIN, top + 26, { width: right - 170, lineBreak: false });
  doc.text("Source: Smart CRM invoices. All amounts in QAR.", MARGIN, top + 40, { width: right - 170, lineBreak: false });
  const brandBottomY = drawBrandHeader(doc, right, top);
  let y = Math.max(top + 58, brandBottomY) + 14;

  const s = r.summary;
  y = drawKpiBand(doc, [
    { label: "INVOICES", value: String(s.invoices) },
    { label: "TOTAL SALES", value: money0(s.totalSales), big: true },
    { label: "PROF. FEE", value: money0(s.profFee) },
    { label: "COLLECTED", value: money0(s.collected) },
    { label: "BALANCE", value: money0(s.balance) },
    { label: "COLLECTED %", value: pct(s.collectedPct) },
  ], y, right);

  if (r.bySalesPerson && r.bySalesPerson.length > 1) {
    const totals = r.bySalesPerson.reduce((a, x) => ({
      invoices: a.invoices + x.invoices, totalSales: a.totalSales + x.totalSales, profFee: a.profFee + x.profFee,
      collected: a.collected + x.collected, balance: a.balance + x.balance,
    }), { invoices: 0, totalSales: 0, profFee: 0, collected: 0, balance: 0 });
    y = drawTable(doc, {
      heading: "By salesperson",
      columns: [
        { key: "name", label: "SALESPERSON", width: 110 },
        { key: "invoices", label: "INV.", width: 34, align: "right" },
        { key: "totalSales", label: "TOTAL SALES", width: 76, align: "right" },
        { key: "profFee", label: "PROF. FEE", width: 76, align: "right" },
        { key: "collected", label: "COLLECTED", width: 76, align: "right" },
        { key: "balance", label: "BALANCE", width: 76, align: "right" },
        { key: "collectedPct", label: "COLL. %", align: "right" },
      ],
      rows: r.bySalesPerson.map((p) => ({
        name: p.name, invoices: p.invoices, totalSales: money2(p.totalSales), profFee: money2(p.profFee),
        collected: money2(p.collected), balance: money2(p.balance), collectedPct: pct(p.collectedPct),
      })),
      totalRow: {
        name: "TOTAL", invoices: totals.invoices, totalSales: money2(totals.totalSales), profFee: money2(totals.profFee),
        collected: money2(totals.collected), balance: money2(totals.balance),
        collectedPct: pct(totals.profFee > 0 ? Math.round((totals.collected / totals.profFee) * 100) : null),
      },
    }, y, right);
  }

  if (r.notes && r.notes.length) {
    doc.font("Inter-SemiBold").fontSize(10).fillColor(INK).text("Notes", MARGIN, y);
    y = doc.y + 4;
    r.notes.forEach((n) => {
      if (y > doc.page.height - MARGIN - 60) { doc.addPage(); y = MARGIN; }
      doc.font("Inter").fontSize(8).fillColor(GRAY).text(`– ${n}`, MARGIN, y, { width: right - MARGIN });
      y = doc.y + 3;
    });
    y += 10;
  }

  const invCols = [
    { key: "date", label: "DATE", width: 54 },
    { key: "id", label: "INVOICE", width: 62 },
    { key: "customer", label: "CUSTOMER" },
    ...(r.showSalesPersonColumn ? [{ key: "salesPerson", label: "SALES PERSON", width: 74 }] : []),
    { key: "service", label: "SERVICE", width: 78 },
    { key: "total", label: "TOTAL", width: 50, align: "right" },
    { key: "profFee", label: "PROF. FEE", width: 50, align: "right" },
    { key: "paid", label: "PAID", width: 46, align: "right" },
    { key: "balance", label: "BALANCE", width: 50, align: "right" },
  ];
  const invTotals = r.invoices.reduce((a, inv) => ({ total: a.total + inv.total, profFee: a.profFee + inv.profFee, paid: a.paid + inv.paid, balance: a.balance + inv.balance }),
    { total: 0, profFee: 0, paid: 0, balance: 0 });
  drawTable(doc, {
    heading: "Invoice detail",
    columns: invCols,
    rows: r.invoices.map((inv) => ({
      date: fmtDate(inv.date), id: inv.id, customer: inv.customer, salesPerson: inv.salesPerson || "—",
      service: inv.service || "—", total: money2(inv.total), profFee: money2(inv.profFee), paid: money2(inv.paid), balance: money2(inv.balance),
    })),
    totalRow: r.invoices.length ? {
      date: "", id: "", customer: "TOTAL", salesPerson: "", service: "",
      total: money2(invTotals.total), profFee: money2(invTotals.profFee), paid: money2(invTotals.paid), balance: money2(invTotals.balance),
    } : null,
  }, y, right);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Inter").fontSize(7).fillColor(GRAY)
      .text(`Generated ${fmtDate(new Date().toISOString().slice(0, 10))} · Page ${i - range.start + 1} of ${range.count}`,
        MARGIN, doc.page.height - MARGIN - 16, { width: doc.page.width - MARGIN * 2, align: "center" });
  }

  doc.end();
}

module.exports = { generateSalesReportPdf };
