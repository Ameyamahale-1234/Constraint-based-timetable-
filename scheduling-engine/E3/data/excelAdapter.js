const { normalizeData } = require('./dataNormalizer');

const SHEET_ALIASES = {
  department: ['Department'], faculty: ['Faculty'], courses: ['Course'], divisions: ['Division'], rooms: ['Room'],
  courseFaculty: ['Course_Faculty (teaches)', 'Course_Faculty', 'teaches'],
  courseDivision: ['Course_Division (offered to)', 'Course_Division', 'offered to']
};
function workbookToRaw(workbook) {
  if (!workbook || !workbook.Sheets || !Array.isArray(workbook.SheetNames)) throw new TypeError('Expected an XLSX workbook object with SheetNames and Sheets');
  let XLSX;
  try { XLSX = require('xlsx'); } catch { throw new Error('Excel file parsing requires the optional "xlsx" package. Install it in the application that reads .xlsx files, or pass parsed workbook rows to loadExcelData().'); }
  const raw = {};
  for (const [key, names] of Object.entries(SHEET_ALIASES)) {
    const sheetName = names.find(name => workbook.Sheets[name]);
    raw[key] = sheetName ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }) : [];
  }
  return raw;
}
function loadExcelData(workbookOrRows) {
  const raw = workbookOrRows?.Sheets ? workbookToRaw(workbookOrRows) : workbookOrRows;
  return normalizeData(raw);
}
module.exports = { loadExcelData, workbookToRaw, SHEET_ALIASES };
