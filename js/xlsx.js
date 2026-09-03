/* ============================================================
   xlsx.js — генерация настоящего .xlsx (ZIP/OOXML) без зависимостей
   ============================================================ */
(function () {
  'use strict';

  // ---------- CRC32 ----------
  const CRC_TABLE = (function () {
    const table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------- Byte writer ----------
  function ByteWriter() { this.bytes = []; }
  ByteWriter.prototype.u16 = function (v) { this.bytes.push(v & 0xFF, (v >>> 8) & 0xFF); return this; };
  ByteWriter.prototype.u32 = function (v) { this.bytes.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); return this; };
  ByteWriter.prototype.raw = function (arr) { for (let i = 0; i < arr.length; i++) this.bytes.push(arr[i]); return this; };
  ByteWriter.prototype.toUint8Array = function () { return new Uint8Array(this.bytes); };

  // ---------- Minimal ZIP (store method, no compression) ----------
  function makeZip(files) {
    const enc = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const dosTime = 0;
    const dosDate = 0x0021; // 1980-01-01

    files.forEach(f => {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;

      const lh = new ByteWriter();
      lh.u32(0x04034b50).u16(20).u16(0).u16(0).u16(dosTime).u16(dosDate)
        .u32(crc).u32(size).u32(size).u16(nameBytes.length).u16(0)
        .raw(nameBytes);
      const localHeaderBytes = lh.toUint8Array();
      localParts.push(localHeaderBytes, data);

      const localHeaderOffset = offset;
      offset += localHeaderBytes.length + data.length;

      const ch = new ByteWriter();
      ch.u32(0x02014b50).u16(20).u16(20).u16(0).u16(0).u16(dosTime).u16(dosDate)
        .u32(crc).u32(size).u32(size).u16(nameBytes.length).u16(0).u16(0)
        .u16(0).u16(0).u32(0).u32(localHeaderOffset)
        .raw(nameBytes);
      centralParts.push(ch.toUint8Array());
    });

    const centralDirStart = offset;
    let centralSize = 0;
    centralParts.forEach(p => { centralSize += p.length; });

    const eocd = new ByteWriter();
    eocd.u32(0x06054b50).u16(0).u16(0).u16(files.length).u16(files.length)
      .u32(centralSize).u32(centralDirStart).u16(0);

    const allParts = localParts.concat(centralParts, [eocd.toUint8Array()]);
    let totalLen = 0;
    allParts.forEach(p => { totalLen += p.length; });
    const out = new Uint8Array(totalLen);
    let pos = 0;
    allParts.forEach(p => { out.set(p, pos); pos += p.length; });
    return out;
  }

  // ---------- XML helpers ----------
  function escapeXML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function colLetter(n) {
    let s = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function buildSheetXML(rows) {
    let rowsXML = '';
    rows.forEach((row, rIdx) => {
      const rNum = rIdx + 1;
      let cellsXML = '';
      row.forEach((cell, cIdx) => {
        if (cell == null) return;
        const ref = colLetter(cIdx + 1) + rNum;
        const styleAttr = cell.style != null ? ` s="${cell.style}"` : '';
        if (cell.type === 'n') {
          cellsXML += `<c r="${ref}"${styleAttr}><v>${cell.v}</v></c>`;
        } else {
          cellsXML += `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXML(cell.v)}</t></is></c>`;
        }
      });
      rowsXML += `<row r="${rNum}">${cellsXML}</row>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/><col min="4" max="4" width="36" customWidth="1"/></cols>
<sheetData>${rowsXML}</sheetData>
</worksheet>`;
  }

  // ---------- Static OOXML parts ----------
  const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const CORE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:creator>Финтрек</dc:creator>
<cp:lastModifiedBy>Финтрек</cp:lastModifiedBy>
</cp:coreProperties>`;

  const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>Финтрек</Application>
</Properties>`;

  const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Расходы" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="2">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  // ---------- Public API ----------
  function textEnc(str) { return new TextEncoder().encode(str); }

  function buildExpensesXlsx({ title, currency, rows, totalAmount }) {
    const sheetRows = [];
    sheetRows.push([{ v: title, type: 's', style: 1 }]);
    sheetRows.push([
      { v: 'Дата', type: 's', style: 1 },
      { v: 'Категория', type: 's', style: 1 },
      { v: `Сумма (${currency})`, type: 's', style: 1 },
      { v: 'Комментарий', type: 's', style: 1 },
    ]);
    rows.forEach(r => {
      sheetRows.push([
        { v: r.date, type: 's' },
        { v: r.category, type: 's' },
        { v: r.amount, type: 'n', style: 2 },
        { v: r.note || '', type: 's' },
      ]);
    });
    sheetRows.push([
      { v: 'Итого', type: 's', style: 1 },
      null,
      { v: totalAmount, type: 'n', style: 3 },
    ]);

    const sheetXML = buildSheetXML(sheetRows);

    const files = [
      { name: '[Content_Types].xml', data: textEnc(CONTENT_TYPES_XML) },
      { name: '_rels/.rels', data: textEnc(RELS_XML) },
      { name: 'docProps/core.xml', data: textEnc(CORE_XML) },
      { name: 'docProps/app.xml', data: textEnc(APP_XML) },
      { name: 'xl/workbook.xml', data: textEnc(WORKBOOK_XML) },
      { name: 'xl/_rels/workbook.xml.rels', data: textEnc(WORKBOOK_RELS_XML) },
      { name: 'xl/styles.xml', data: textEnc(STYLES_XML) },
      { name: 'xl/worksheets/sheet1.xml', data: textEnc(sheetXML) },
    ];

    const zipBytes = makeZip(files);
    return new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  window.XlsxExport = { buildExpensesXlsx };
})();
