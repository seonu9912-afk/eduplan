import JSZip from "jszip";
import resources from "./hwpx-resources.json";
import type { TeachingReport, ReportBlock } from "./teaching-report";

// Editable OWPML paragraphs/tables. Text never becomes raw markup or an image.
export function escapeHwpx(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
const namespaces = resources.header.match(/xmlns:[\w]+="[^"]*"/g)!.join(" ");
const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export async function exportTeachingHwpx(
  report: TeachingReport,
): Promise<Uint8Array> {
  if (!report.sections.length) throw new Error("출력할 계획이 없습니다.");
  const zip = new JSZip(),
    s = resources.styles;
  let id = 1;
  const paragraph = (
    value: string,
    character = s.normal,
    property = s.left,
    control = "",
  ) =>
    `<hp:p id="${id++}" paraPrIDRef="${property}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${character}">${control}<hp:t>${escapeHwpx(value)}</hp:t></hp:run></hp:p>`;
  const paragraphs = (value: string, character = s.normal, property = s.left) =>
    value
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => paragraph(line, character, property))
      .join("");
  const table = (
    block: Extract<ReportBlock, { kind: "table" }>,
    width: number,
  ) => {
    const total = block.widths.reduce((a, b) => a + b, 0);
    if (
      !total ||
      block.headers.length !== block.widths.length ||
      block.rows.some((r) => r.length !== block.headers.length)
    )
      throw new Error("출력 표의 열 구성을 확인하세요.");
    let used = 0;
    const widths = block.widths.map((w, i) => {
      const n =
        i === block.widths.length - 1
          ? width - used
          : Math.floor((w / total) * width);
      used += n;
      return n;
    });
    const rows = [block.headers, ...block.rows];
    const content = rows
      .map(
        (row, r) =>
          `<hp:tr>${row.map((value, c) => `<hp:tc name="" header="${r === 0 ? 1 : 0}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${r === 0 ? s.headerBorder : s.cellBorder}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraphs(value, r === 0 ? s.bold : s.normal, r === 0 ? s.center : s.left)}</hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${widths[c]}" height="2400"/><hp:cellMargin left="180" right="180" top="180" bottom="180"/></hp:tc>`).join("")}</hp:tr>`,
      )
      .join("");
    const markup = `<hp:tbl id="${id++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${block.headers.length}" cellSpacing="0" borderFillIDRef="${s.cellBorder}" noAdjust="0"><hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${rows.length * 2400}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="300" bottom="300"/><hp:inMargin left="180" right="180" top="180" bottom="180"/>${content}</hp:tbl>`;
    return paragraph("", s.normal, s.left, markup);
  };
  // The mimetype is first and stored without compression, as required by HWPX.
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  zip.file(
    "version.xml",
    `${xml}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="EduPlan" appVersion="1.0"/>`,
  );
  zip.file(
    "Contents/header.xml",
    xml +
      resources.header.replace(
        /secCnt="\d+"/,
        `secCnt="${report.sections.length}"`,
      ),
  );
  for (const [index, section] of report.sections.entries()) {
    const landscape = section.orientation === "landscape",
      width = (landscape ? 84188 : 59528) - 5668;
    const properties = resources.section_properties.replace(
      /landscape="\w+"/,
      `landscape="${landscape ? "NARROWLY" : "WIDELY"}"`,
    );
    const controls = `${properties}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`;
    const content =
      paragraph("", s.normal, s.left, controls) +
      paragraph(section.title, s.title, s.center) +
      section.blocks
        .map((b) =>
          b.kind === "table"
            ? table(b, width)
            : paragraphs(
                b.text,
                b.kind === "heading" ? s.heading : s.normal,
                b.kind === "heading" ? s.headingParagraph : s.left,
              ),
        )
        .join("");
    zip.file(
      `Contents/section${index}.xml`,
      `${xml}<hs:sec ${namespaces}>${content}</hs:sec>`,
    );
  }
  const items = report.sections
    .map(
      (_, i) =>
        `<opf:item id="section${i}" href="Contents/section${i}.xml" media-type="application/xml"/>`,
    )
    .join("");
  const spine = report.sections
    .map((_, i) => `<opf:itemref idref="section${i}" linear="yes"/>`)
    .join("");
  zip.file(
    "Contents/content.hpf",
    `${xml}<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="" unique-identifier="" id=""><opf:metadata><opf:title>${escapeHwpx(report.title)}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">EduPlan</opf:meta></opf:metadata><opf:manifest><opf:item id="version" href="version.xml" media-type="application/xml"/><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>${items}<opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/>${spine}</opf:spine></opf:package>`,
  );
  zip.file("settings.xml", resources.settings);
  zip.file(
    "META-INF/container.xml",
    `${xml}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`,
  );
  zip.file(
    "META-INF/manifest.xml",
    `${xml}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`,
  );
  zip.file(
    "Preview/PrvText.txt",
    report.sections
      .map((s) =>
        [
          s.title,
          ...s.blocks.map((b) =>
            b.kind === "table"
              ? [b.headers, ...b.rows].map((r) => r.join("\t")).join("\n")
              : b.text,
          ),
        ].join("\n"),
      )
      .join("\n\n"),
  );
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/hwp+zip",
  });
}
