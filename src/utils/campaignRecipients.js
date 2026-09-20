// Parses an uploaded name + email list (CSV or Excel) for a bulk email campaign. Deliberately
// forgiving about layout — a header row with "Email"/"Name" columns in any order, extra columns,
// or a bare two-column list with no header at all — because the person uploading is a Data Manager
// pasting whatever export they have, not someone who'll reformat it first.
const XLSX = require("xlsx");

// Pulls the first thing that looks like an address out of a cell, so "John <john@x.com>",
// "mailto:john@x.com" and "john@x.com; other@x.com" all still yield a usable address.
// The local part can't contain ":" — that's what stops "mailto:bob@z.com" / "Email:bob@z.com" being
// read as an address that literally starts with the prefix.
const EMAIL_IN_CELL = /[^\s@,;:<>"'()]+@[^\s@,;<>"'()]+\.[^\s@,;<>"'()]+/;
const MAX_EMAIL_LENGTH = 254;

const cellText = (c) => (c === null || c === undefined ? "" : String(c).trim());
const looksLikeEmail = (c) => EMAIL_IN_CELL.test(cellText(c));

/**
 * @param {Buffer} buffer  the uploaded file's bytes
 * @returns {{ recipients: {email:string, name:string}[], total:number, invalid:number, duplicates:number }}
 *   total = non-empty data rows read; invalid = rows with no usable address; duplicates = repeat
 *   addresses within the file (case-insensitive) — only the first occurrence is kept.
 */
function parseRecipients(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { recipients: [], total: 0, invalid: 0, duplicates: 0 };
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }).filter((r) => r.some((c) => cellText(c)));
  if (!rows.length) return { recipients: [], total: 0, invalid: 0, duplicates: 0 };

  // A first row with no address-looking cell is a header (a first row that is itself an address is
  // just the first data row of a headerless list).
  const hasHeader = !rows[0].some(looksLikeEmail);
  let emailIdx = -1;
  let nameIdx = -1;
  if (hasHeader) {
    const headers = rows[0].map((h) => cellText(h).toLowerCase());
    emailIdx = headers.findIndex((h) => /e-?mail/.test(h));
    const nameCols = headers.map((h, i) => ({ h, i })).filter(({ h, i }) => i !== emailIdx && /name|contact|person/.test(h));
    // Prefer a plain "name"-style column over e.g. "Company Name" / "Contact Number" when several match.
    const exact = nameCols.find(({ h }) => /^(full\s+)?name$|^contact(\s+person)?(\s+name)?$/.test(h));
    nameIdx = (exact || nameCols.find(({ h }) => !/company|number|phone|mobile/.test(h)) || nameCols[0] || { i: -1 }).i;
  }
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const seen = new Set();
  const recipients = [];
  let invalid = 0;
  let duplicates = 0;
  let total = 0;
  for (const row of dataRows) {
    if (!row.some((c) => cellText(c))) continue;
    total++;
    const emailCell = emailIdx >= 0 && looksLikeEmail(row[emailIdx]) ? row[emailIdx] : row.find(looksLikeEmail);
    const match = emailCell === undefined ? null : cellText(emailCell).match(EMAIL_IN_CELL);
    const email = match ? match[0].toLowerCase() : "";
    if (!email || email.length > MAX_EMAIL_LENGTH) { invalid++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);

    let name = nameIdx >= 0 ? cellText(row[nameIdx]) : "";
    if (!name) {
      // No usable name column — fall back to the first non-empty text cell that isn't an address.
      const other = row.find((c) => cellText(c) && !looksLikeEmail(c));
      name = other !== undefined && !/^[\d\s+()-]+$/.test(cellText(other)) ? cellText(other) : "";
    }
    recipients.push({ email, name: name.slice(0, 200) });
  }
  return { recipients, total, invalid, duplicates };
}

module.exports = { parseRecipients };
