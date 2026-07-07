// Export Excel SANS dependance npm (evite tout risque sur le build Bolt/OTA).
//
// On genere du SpreadsheetML 2003 (XML) : format multi-feuilles lisible
// nativement par Excel et LibreOffice, avec en-tetes en gras. Fichier .xls.
export type CellValue = string | number | null | undefined;

export interface SheetData {
  name: string;
  /** 1re ligne = en-tete (mise en gras). Lignes suivantes = donnees. */
  rows: CellValue[][];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Excel : nom de feuille <= 31 caracteres, sans []:*?/\
function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31).trim();
  return cleaned || `Feuille${index + 1}`;
}

function cellXml(v: CellValue): string {
  if (v === null || v === undefined || v === '') {
    return '<Cell><Data ss:Type="String"></Data></Cell>';
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(String(v))}</Data></Cell>`;
}

function headerCellXml(v: CellValue): string {
  const text = v === null || v === undefined ? '' : escapeXml(String(v));
  return `<Cell ss:StyleID="hdr"><Data ss:Type="String">${text}</Data></Cell>`;
}

function sheetXml(sheet: SheetData, index: number): string {
  const name = sanitizeSheetName(sheet.name, index);
  const rowsXml = sheet.rows
    .map((row, r) => {
      const cells = row.map((c) => (r === 0 ? headerCellXml(c) : cellXml(c))).join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${rowsXml}</Table></Worksheet>`;
}

export function buildSpreadsheetXml(sheets: SheetData[]): string {
  const body = sheets.map((s, i) => sheetXml(s, i)).join('');
  return (
    '<?xml version="1.0"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Styles>' +
    '<Style ss:ID="hdr"><Font ss:Bold="1"/>' +
    '<Interior ss:Color="#FDE68A" ss:Pattern="Solid"/>' +
    '<Alignment ss:Vertical="Center"/></Style>' +
    '</Styles>' +
    body +
    '</Workbook>'
  );
}

/** Genere et telecharge le classeur (.xls). */
export function downloadSpreadsheet(filename: string, sheets: SheetData[]): void {
  const xml = buildSpreadsheetXml(sheets);
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
