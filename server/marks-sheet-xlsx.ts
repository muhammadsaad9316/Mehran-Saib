import AdmZip from "adm-zip";
import { marksSheetCollege, type MarksSheet } from "./marks-sheet.js";

const spreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function xmlText(value: string): string {
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

/** A small, server-owned SpreadsheetML export using the existing ZIP dependency. */
export function marksSheetXlsx(sheet: MarksSheet): Buffer {
  const textCell = (address: string, value: string, style: number) =>
    `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
  const numberCell = (address: string, value: number | null, style: number) =>
    `<c r="${address}" s="${style}">${value === null ? "" : `<v>${value}</v>`}</c>`;
  const heading = (row: number, text: string, style: number, height: number) =>
    `<row r="${row}" ht="${height}" customHeight="1">${textCell(`A${row}`, text, style)}</row>`;
  const lastDataRow = sheet.rows.length + 5;
  const noteRow = lastDataRow + 2;
  const rows = [
    heading(1, marksSheetCollege, 7, 32),
    heading(2, sheet.title, 8, 27),
    heading(3, "BS: Computer Science   |   Semester: 7th   |   Subject: Web Engineering", 9, 25),
    '<row r="4" ht="12" customHeight="1"/>',
    `<row r="5" ht="30" customHeight="1">${["R. No", "Name", "Marks in Figure", "Marks in Words"].map((label, i) => textCell(`${"ABCD"[i]}5`, label, 10)).join("")}</row>`,
    ...sheet.rows.map((row, i) => {
      const r = i + 6;
      const stripe = i % 2 ? 3 : 0;
      const height = Math.max(24, Math.ceil(row.name.length / 32) * 15 + 8, Math.ceil(row.words.length / 38) * 15 + 8);
      return `<row r="${r}" ht="${height}" customHeight="1">${textCell(`A${r}`, row.rollNumber, 3 + stripe)}${textCell(`B${r}`, row.name, 1 + stripe)}${numberCell(`C${r}`, row.marks, 2 + stripe)}${textCell(`D${r}`, row.words, 1 + stripe)}</row>`;
    }),
    heading(noteRow, "Blank marks indicate incomplete grading. Totals include all saved grades, including drafts.", 9, 30),
  ];
  const styles = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    ...[0, 3].flatMap((fill) => [
      `<xf numFmtId="0" fontId="0" fillId="${fill}" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>`,
      `<xf numFmtId="0" fontId="0" fillId="${fill}" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>`,
      `<xf numFmtId="0" fontId="0" fillId="${fill}" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    ]),
    ...[1, 2, 4].map((font) => `<xf numFmtId="0" fontId="${font}" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`),
    '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
  ];
  const parts: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationshipNamespace}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${spreadsheetNamespace}" xmlns:r="${relationshipNamespace}"><bookViews><workbookView/></bookViews><sheets><sheet name="Marks sheet" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Marks sheet'!$A$1:$D$${noteRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'Marks sheet'!$1:$5</definedName></definedNames></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationshipNamespace}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${relationshipNamespace}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${spreadsheetNamespace}"><fonts count="5"><font><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Arial"/></font><font><b/><sz val="12"/><color rgb="FFC2410C"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FF64748B"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF97316"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="hair"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11">${styles.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${spreadsheetNamespace}"><sheetPr><tabColor rgb="FFF97316"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:D${noteRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A6" sqref="A6"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols><col min="1" max="1" width="9" customWidth="1"/><col min="2" max="2" width="36" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="4" width="42" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData>${sheet.rows.length ? `<autoFilter ref="A5:D${lastDataRow}"/>` : ""}<mergeCells count="4"><mergeCell ref="A1:D1"/><mergeCell ref="A2:D2"/><mergeCell ref="A3:D3"/><mergeCell ref="A${noteRow}:D${noteRow}"/></mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${xmlText(sheet.title)}&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter></worksheet>`,
  };
  const zip = new AdmZip();
  for (const [path, xml] of Object.entries(parts))
    zip.addFile(path, Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${xml}`, "utf8"));
  return zip.toBuffer();
}
