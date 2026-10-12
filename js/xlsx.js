/* Minimal .xlsx writer (no libraries): styled cells, number/date formats,
 * merged cells, column widths and frozen header rows. Files are packed in an
 * uncompressed ZIP, which Excel, Numbers, LibreOffice and Google Sheets open. */
(function () {
  'use strict';

  // ---------- ZIP (store method) ----------
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(files) {
    var enc = new TextEncoder();
    var parts = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var body = enc.encode(f.data);
      var crc = crc32(body);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint16(8, 0, true);      // stored
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, body.length, true);
      local.setUint32(22, body.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, body);

      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true);
      cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, body.length, true);
      cd.setUint32(24, body.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + body.length;
    });

    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // ---------- workbook ----------
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }

  // Cell styles referenced by name. Index = position in cellXfs below.
  var STYLE = {
    text: 0, title: 1, subtitle: 2, label: 3, header: 4, date: 5, money: 6,
    moneyBold: 7, bold: 8, muted: 9, moneyIn: 10, moneyOut: 11, totalLabel: 12, totalMoney: 13, number: 14,
    headerRight: 15
  };

  var STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3">' +
    '<numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>' +
    '<numFmt numFmtId="165" formatCode="#,##0.00;-#,##0.00;&quot;-&quot;"/>' +
    '<numFmt numFmtId="166" formatCode="#,##0.######"/>' +
    '</numFmts>' +
    '<fonts count="6">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="18"/><color rgb="FF1C5CAB"/><name val="Calibri"/></font>' +
    '<font><sz val="11"/><color rgb="FF52514E"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><sz val="11"/><color rgb="FF006300"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="4">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1C5CAB"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF0EFEC"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="3">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE1E0D9"/></bottom><diagonal/></border>' +
    '<border><left/><right/><top style="thin"><color rgb="FF0B0B0B"/></top><bottom style="double"><color rgb="FF0B0B0B"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="16">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"/>' +                                       // text
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>' +                                         // title
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>' +                                         // subtitle
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" applyFont="1" applyFill="1"/>' +                            // label
    '<xf numFmtId="0" fontId="4" fillId="2" borderId="0" applyFont="1" applyFill="1"/>' +                            // header
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>' + // date
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>' +                // money
    '<xf numFmtId="165" fontId="3" fillId="3" borderId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +    // moneyBold
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/>' +                                          // bold
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" applyFont="1" applyBorder="1"/>' +                          // muted
    '<xf numFmtId="165" fontId="5" fillId="0" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +  // moneyIn
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>' +                // moneyOut
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="2" applyFont="1" applyBorder="1"/>' +                          // totalLabel
    '<xf numFmtId="165" fontId="3" fillId="0" borderId="2" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +  // totalMoney
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>' +                // number
    '<xf numFmtId="0" fontId="4" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf>' + // headerRight
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function colName(i) {
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  // 'YYYY-MM-DD' -> Excel serial date.
  function excelDate(iso) {
    var d = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    return d / 86400000 + 25569;
  }

  function sheetXml(sheet) {
    var rowsXml = sheet.rows.map(function (row, r) {
      if (!row) return '';
      var cells = row.map(function (cell, c) {
        if (cell == null || cell === '') return '';
        if (typeof cell !== 'object') cell = { v: cell };
        var ref = colName(c) + (r + 1);
        var s = STYLE[cell.s || (typeof cell.v === 'number' ? 'money' : 'text')] || 0;
        if (cell.v === '' || cell.v == null) return '<c r="' + ref + '" s="' + s + '"/>';
        if (cell.s === 'date' && typeof cell.v === 'string') {
          return '<c r="' + ref + '" s="' + s + '"><v>' + excelDate(cell.v) + '</v></c>';
        }
        if (typeof cell.v === 'number' && isFinite(cell.v)) {
          return '<c r="' + ref + '" s="' + s + '"><v>' + cell.v + '</v></c>';
        }
        return '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(cell.v) + '</t></is></c>';
      }).join('');
      var ht = sheet.heights && sheet.heights[r] ? ' ht="' + sheet.heights[r] + '" customHeight="1"' : '';
      return '<row r="' + (r + 1) + '"' + ht + '>' + cells + '</row>';
    }).join('');

    var pane = sheet.freezeRow
      ? '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="' + sheet.freezeRow +
        '" topLeftCell="A' + (sheet.freezeRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
    var cols = sheet.cols ? '<cols>' + sheet.cols.map(function (w, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join('') + '</cols>' : '';
    var merges = sheet.merges && sheet.merges.length
      ? '<mergeCells count="' + sheet.merges.length + '">' + sheet.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>'
      : '';
    var filter = sheet.autoFilter ? '<autoFilter ref="' + sheet.autoFilter + '"/>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' + pane + cols + '<sheetData>' + rowsXml + '</sheetData>' + filter + merges +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  function build(sheets) {
    var files = [];
    files.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (_, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') +
        '</Types>'
    });
    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
    });
    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' + sheets.map(function (s, i) {
          return '<sheet name="' + esc(s.name.replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') + '</sheets></workbook>'
    });
    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (_, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'
    });
    files.push({ name: 'xl/styles.xml', data: STYLES_XML });
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) }); });
    return zip(files);
  }

  window.XLSX = { build: build, colName: colName };
})();
