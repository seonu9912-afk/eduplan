/* Self-contained browser XLSX export; no Drive, OAuth, or CDN dependency.
 * Produces Office Open XML with styled titles, headers, freeze panes,
 * wrapped text, width and row heights. Text is never interpreted as a formula.
 */
const enc = new TextEncoder();
const u16=(arr,x)=>{arr.push(x&255,(x>>>8)&255);};
const u32=(arr,x)=>{arr.push(x&255,(x>>>8)&255,(x>>>16)&255,(x>>>24)&255);};
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);return c>>>0;});
const crc32=bytes=>{let c=0xFFFFFFFF;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
const strXml=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
const attr=strXml;
const colName=n=>{let out='';for(let x=n;x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;return out;};
function zipStore(files){const local=[],central=[];let offset=0,count=0;
  for(const [name,source] of files){const n=enc.encode(name),bytes=enc.encode(source),crc=crc32(bytes),h=[];
    u32(h,0x04034b50);u16(h,20);u16(h,0x0800);u16(h,0);u16(h,0);u16(h,0);u32(h,crc);u32(h,bytes.length);u32(h,bytes.length);u16(h,n.length);u16(h,0);
    local.push(Uint8Array.from(h),n,bytes);
    const c=[];u32(c,0x02014b50);u16(c,20);u16(c,20);u16(c,0x0800);u16(c,0);u16(c,0);u16(c,0);u32(c,crc);u32(c,bytes.length);u32(c,bytes.length);u16(c,n.length);u16(c,0);u16(c,0);u16(c,0);u16(c,0);u32(c,0);u32(c,offset);central.push(Uint8Array.from(c),n);
    offset+=h.length+n.length+bytes.length;count++;
  }
  const centralSize=central.reduce((sum,b)=>sum+b.length,0),end=[];u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,count);u16(end,count);u32(end,centralSize);u32(end,offset);u16(end,0);
  return new Blob([...local,...central,Uint8Array.from(end)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const dayTones=['FFE8E8','F0E7FA','FFF1D7','EEF2F6','E9F3FF'];
const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="15"/><color rgb="FF17335C"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font></fonts>
<fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF315CA8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF1FC"/><bgColor indexed="64"/></patternFill></fill>${dayTones.map(color=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDDE4EF"/></left><right style="thin"><color rgb="FFDDE4EF"/></right><top style="thin"><color rgb="FFDDE4EF"/></top><bottom style="thin"><color rgb="FFDDE4EF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>${dayTones.map((_,i)=>`<xf numFmtId="0" fontId="0" fillId="${4+i}" borderId="1" xfId="0" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
function xmlSheet(sheet){const rows=sheet.rows||[],cols=Math.max(1,...rows.map(r=>r.length));const widths=sheet.widths||[];
  const colXml=Array.from({length:cols},(_,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.min(48,Math.max(8,Number(widths[i])||14))}" customWidth="1"/>`).join('');
  const rowsXml=rows.map((row,i)=>{const height=i===0?33:i<(sheet.headerRows??2)?27:sheet.print?17:Math.min(395,Math.max(25,...row.map(v=>String(v??'').split('\n').length*14)));
    const cells=row.map((value,j)=>{if(value==null||value==='')return '';
      const style=sheet.cellStyles?.[i]?.[j]??(i===0?1:i>=(sheet.headerStartRow??2)-1&&i<(sheet.headerRows??2)?2:0),ref=`${colName(j+1)}${i+1}`;
      if(typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${strXml(value)}</t></is></c>`;
    }).join('');return `<row r="${i+1}" ht="${height}" customHeight="1">${cells}</row>`;}).join('');
  const merges=(sheet.merges||[{from:[1,1],to:[1,cols]}]).filter(m=>m).map(m=>`<mergeCell ref="${colName(m.from[1])}${m.from[0]}:${colName(m.to[1])}${m.to[0]}"/>`).join('');
  const freeze=sheet.freezeRows??2,freezeCols=sheet.freezeCols??0;const sheetViews=`<sheetViews><sheetView workbookViewId="0">${freeze||freezeCols?`<pane ${freezeCols?`xSplit="${freezeCols}"`:''} ${freeze?`ySplit="${freeze}"`:''} topLeftCell="${colName(freezeCols+1)}${freeze+1}" activePane="${freezeCols&&freeze?'bottomRight':freeze?'bottomLeft':'topRight'}" state="frozen"/>`:''}</sheetView></sheetViews>`;
  const print=sheet.print;
  const sheetPr=print?`<sheetPr><pageSetUpPr fitToPage="${print==='A3'?1:0}"/></sheetPr>`:'';
  const filter=sheet.filter?`<autoFilter ref="A2:${colName(cols)}${rows.length}"/>`:'';
  const page=print?`<pageMargins left="0.2" right="0.2" top="0.35" bottom="0.35" header="0.15" footer="0.15"/><pageSetup paperSize="${print==='A3'?8:9}" orientation="landscape"${print==='A3'?' fitToWidth="1" fitToHeight="1"':' scale="80"'}/>${print==='A4'?'<colBreaks count="1" manualBreakCount="1"><brk id="7" min="0" max="1048575" man="1"/></colBreaks>':''}`:'';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sheetPr}${sheetViews}<sheetFormatPr defaultRowHeight="22"/><cols>${colXml}</cols><sheetData>${rowsXml}</sheetData>${filter}${merges?`<mergeCells count="${(sheet.merges||[1]).length}">${merges}</mergeCells>`:''}${page}</worksheet>`;
}
export function createAcademicXlsx(sheets){if(!Array.isArray(sheets)||!sheets.length)throw new Error('출력할 시트가 없습니다.');
  const names=sheets.map((s,i)=>String(s.name||`시트${i+1}`).slice(0,31).replace(/[\\/?*\[\]:]/g,'_'));
  if(new Set(names).size!==names.length)throw new Error('시트 이름이 중복됩니다.');
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const defs=sheets.flatMap((s,i)=>s.print?[`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${attr(names[i].replaceAll("'","''"))}'!$A$1:$M$33</definedName>`,`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${attr(names[i].replaceAll("'","''"))}'!$1:$2,'${attr(names[i].replaceAll("'","''"))}'!$A:$A</definedName>`]:[]).join('');
  const wb=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n,i)=>`<sheet name="${attr(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>${defs?`<definedNames>${defs}</definedNames>`:''}</workbook>`;
  const wbRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const files=[['[Content_Types].xml',contentTypes],['_rels/.rels',rootRels],['xl/workbook.xml',wb],['xl/_rels/workbook.xml.rels',wbRels],['xl/styles.xml',styles],...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,xmlSheet(s)])];
  return zipStore(files);
}
