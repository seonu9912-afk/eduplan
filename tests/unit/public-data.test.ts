import { it, expect } from "vitest";
import { parseHolidayXML } from "../../src/lib/public-data-parse";
const xml = (body: string, count = 1) =>
  `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><totalCount>${count}</totalCount><items>${body}</items></body></response>`;
const item =
  "<item><locdate>20260505</locdate><dateName>어린이날</dateName><isHoliday>Y</isHoliday></item>";
it("requires code 00, complete data and valid dates for holiday success", () => {
  expect(parseHolidayXML(xml(item))).toMatchObject({
    resultCode: "00",
    parsed: true,
    days: { "2026-05-05": "어린이날" },
  });
  expect(parseHolidayXML(xml(item, 2)).parsed).toBe(false);
  expect(
    parseHolidayXML(xml(item.replace("20260505", "20260230"))).parsed,
  ).toBe(false);
  expect(parseHolidayXML(xml(item).replace("</response>", "")).parsed).toBe(
    false,
  );
});
it("preserves gateway code 10 independently of the service resultCode", () => {
  expect(
    parseHolidayXML(
      "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>10</returnReasonCode><returnAuthMsg>잘못된 요청 파라미터 에러</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>",
    ),
  ).toMatchObject({ parsed: false, resultCode: "", returnReasonCode: "10" });
});
