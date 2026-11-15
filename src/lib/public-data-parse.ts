import { XMLParser, XMLValidator } from "fast-xml-parser";
import { isoDate } from "./domain";
export function parseHolidayXML(raw: string) {
  const empty = {
    resultCode: "",
    resultMsg: "",
    returnReasonCode: "",
    parsed: false,
    days: {} as Record<string, string>,
  };
  if (/<!DOCTYPE|<!ENTITY/i.test(raw) || XMLValidator.validate(raw) !== true)
    return empty;
  const data = new XMLParser({
    parseTagValue: false,
    ignoreAttributes: true,
  }).parse(raw);
  const error = data.OpenAPI_ServiceResponse?.cmmMsgHeader;
  const header = data.response?.header;
  const body = data.response?.body;
  const resultCode = String(header?.resultCode ?? ""),
    resultMsg = String(header?.resultMsg ?? error?.returnAuthMsg ?? ""),
    returnReasonCode = String(error?.returnReasonCode ?? "");
  const values = body?.items?.item;
  const items = values ? (Array.isArray(values) ? values : [values]) : [];
  const days: Record<string, string> = {};
  let parsed =
    resultCode === "00" &&
    Number(body?.totalCount) > 0 &&
    Number(body?.totalCount) === items.length;
  for (const item of items) {
    const rawDate = String(item.locdate ?? ""),
      date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6)}`;
    if (
      !/^\d{8}$/.test(rawDate) ||
      !isoDate.safeParse(date).success ||
      !item.dateName ||
      !["Y", "N"].includes(item.isHoliday)
    ) {
      parsed = false;
      continue;
    }
    if (item.isHoliday === "Y") days[date] = String(item.dateName);
  }
  return { resultCode, resultMsg, returnReasonCode, parsed, days };
}
