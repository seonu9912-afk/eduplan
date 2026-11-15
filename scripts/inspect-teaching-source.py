"""Inventory a teaching-plan HWPX and extract source-addressable editing data."""
from __future__ import annotations

import argparse
from datetime import date, timedelta
import hashlib
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile


def tag(element):
    return element.tag.rsplit("}", 1)[-1]


def children(node, name):
    return [element for element in node if tag(element) == name]


def plain(node):
    text = []
    for element in node.iter():
        kind = tag(element)
        if kind == "t" and element.text:
            text.append(element.text)
        elif kind == "lineBreak":
            text.append("\n")
        elif kind == "tab":
            text.append("\t")
        if kind in {"lineBreak", "tab"} and element.tail:
            text.append(element.tail)
    return "".join(text)


def integer(node, name, default=0):
    return int(node.attrib.get(name, default)) if node is not None else default


def get_cell(node):
    address = next(iter(children(node, "cellAddr")), None)
    span = next(iter(children(node, "cellSpan")), None)
    size = next(iter(children(node, "cellSz")), None)
    sublist = next(iter(children(node, "subList")), None)
    blocks = [] if sublist is None else get_blocks(sublist)
    return {
        "row": integer(address, "rowAddr"),
        "col": integer(address, "colAddr"),
        "rowspan": integer(span, "rowSpan", 1),
        "colspan": integer(span, "colSpan", 1),
        "width": integer(size, "width"),
        "height": integer(size, "height"),
        "attrs": dict(node.attrib),
        "blocks": blocks,
        "text": "\n".join(b["text"] for b in blocks if b["kind"] == "paragraph"),
    }


def get_table(node):
    cells = [get_cell(tc) for tr in children(node, "tr") for tc in children(tr, "tc")]
    return {
        "kind": "table",
        "row_count": integer(node, "rowCnt"),
        "column_count": integer(node, "colCnt"),
        "attrs": dict(node.attrib),
        "cells": cells,
    }


def get_blocks(node):
    blocks = []
    for paragraph in children(node, "p"):
        direct_text = []
        for run in children(paragraph, "run"):
            for element in run:
                if tag(element) == "tbl":
                    if direct_text:
                        blocks.append({
                            "kind": "paragraph", "text": "".join(direct_text),
                            "attrs": dict(paragraph.attrib),
                        })
                        direct_text.clear()
                    blocks.append(get_table(element))
                elif tag(element) == "t":
                    direct_text.append(plain(element))
        if direct_text or not any(tag(e) == "tbl" for e in paragraph.iter()):
            blocks.append({
                "kind": "paragraph", "text": "".join(direct_text),
                "attrs": dict(paragraph.attrib),
            })
    return blocks


WEEK_COLUMNS = [
    "month", "week", "day", "title", "standard_text", "content", "method",
    "assessment_method", "alignment", "note",
]


def week_data(table):
    # Preserve each merged origin and original row coordinates independently.
    cells = {}
    for cell in table["cells"]:
        for row in range(cell["row"], cell["row"] + cell["rowspan"]):
            for col in range(cell["col"], cell["col"] + cell["colspan"]):
                cells[(row, col)] = cell
    if [cells[(0, n)]["text"].strip() for n in range(3)] != ["월", "주", "일"]:
        raise ValueError("주차표 헤더가 예상한 형식과 다릅니다.")
    return [
        {
            "source_row": row,
            "fields": {
                field: {
                    "text": cells[(row, col)]["text"],
                    "origin": [cells[(row, col)]["row"], cells[(row, col)]["col"]],
                }
                for col, field in enumerate(WEEK_COLUMNS)
                if (row, col) in cells
            },
        }
        for row in range(2, table["row_count"])
    ]


def canonical_weeks(plan):
    """Group multiple original rows in the same calendar week without dropping cell origins."""
    groups = {}
    for row in plan["weeks"]:
        fields = row["fields"]
        month = int(fields["month"]["text"].strip())
        year = plan["year"] + (month < 3)
        first_day, *rest = map(int, re.findall(r"\d+", fields["day"]["text"]))
        start = date(year, month, first_day)
        end = start
        if rest:
            end_month = month + (rest[0] < first_day)
            end = date(year + (end_month > 12), (end_month - 1) % 12 + 1, rest[0])
        anchor = start - timedelta(days=start.weekday())
        if end > anchor + timedelta(days=6):
            raise ValueError(f"{plan['weekly_section']} row {row['source_row']} crosses calendar weeks")
        entry = groups.setdefault(anchor.isoformat(), {
            "start": start.isoformat(), "end": end.isoformat(), "source_rows": [], "authored_fields": {},
        })
        entry["start"], entry["end"] = min(entry["start"], start.isoformat()), max(entry["end"], end.isoformat())
        entry["source_rows"].append(row["source_row"])
        for key in WEEK_COLUMNS[3:]:
            if key not in fields:
                continue
            fragments = entry["authored_fields"].setdefault(key, [])
            if not any(fragment["origin"] == fields[key]["origin"] for fragment in fragments):
                fragments.append(fields[key])
    return [{"monday": anchor, **entry} for anchor, entry in groups.items()]


def normalized(text):
    return re.sub(r"\s+", "", text)


def rubric_inventory(table):
    """Link each authored descriptor to its partner score by source coordinate."""
    cells = table["cells"]
    header = next(c for c in cells if normalized(c["text"]) == "평가기준및배점")
    occupied = {}
    for c in cells:
        for r in range(c["row"], c["row"] + c["rowspan"]):
            for col in range(c["col"], c["col"] + c["colspan"]):
                occupied[(r, col)] = c
    output = []
    for r in range(header["row"] + 1, table["row_count"] - 1):
        descriptors = [
            c for c in cells if c["row"] == r and c["col"] >= header["col"]
        ]
        if not descriptors or not all(
            re.fullmatch(r"\s*\d+(?:\.\d+)?\s*", occupied.get((r + 1, c["col"]), {}).get("text", ""))
            for c in descriptors
        ):
            continue
        levels = [{
            "description": c["text"],
            "points": float(occupied[(r + 1, c["col"])]["text"].strip()),
            "description_origin": [r, c["col"]],
            "points_origin": [occupied[(r + 1, c["col"])]["row"], occupied[(r + 1, c["col"])]["col"]],
        } for c in descriptors]
        identity = [
            c for c in cells
            if c["col"] < header["col"] and c["row"] <= r < c["row"] + c["rowspan"]
        ]
        output.append({"row": r, "criterion_cells": identity, "levels": levels})
    return output


def detail_tables(plan):
    tables = [
        b for b in plan["assessment_blocks"] if b["kind"] == "table" and b["cells"]
        and normalized(b["cells"][0]["text"]) == "평가시기"
    ]
    return [{"table": t, "criteria": rubric_inventory(t)} for t in tables]


def read_source(path):
    with ZipFile(path) as document:
        sections = [
            (entry, ET.fromstring(document.read(entry)))
            for entry in sorted(document.namelist())
            if re.fullmatch(r"Contents/section\d+\.xml", entry)
        ]
    if len(sections) != 6:
        raise ValueError("학년별 교수학습표와 평가계획의 6개 섹션을 찾지 못했습니다.")
    plans = []
    for i, (section, root) in enumerate(sections[::2]):
        title_text = plain(root)
        metadata = re.search(r"(\d{4})학년도\s*([123])학년\s*([12])학기", title_text)
        if not metadata:
            raise ValueError("학년도·학년·학기 표기를 확인하세요.")
        year, grade, semester = map(int, metadata.groups())
        blocks = get_blocks(root)
        wiki = next(block for block in blocks if block["kind"] == "table" and block["column_count"] == 10)
        assessment_section, assessment_xml = sections[2 * i + 1]
        assessment = get_blocks(assessment_xml)
        plan = {
            "year": year, "grade": grade, "semester": semester,
            "weekly_section": section, "assessment_section": assessment_section,
            "weekly_blocks": blocks, "weeks": week_data(wiki),
            "assessment_blocks": assessment,
        }
        plan["canonical_weeks"] = canonical_weeks(plan)
        plan["rubrics"] = detail_tables(plan)
        plans.append(plan)
    return {"filename": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "plans": plans}


def inventory(source):
    output = []
    for plan in source["plans"]:
        tables = [
            block for category in ("weekly_blocks", "assessment_blocks")
            for block in plan[category] if block["kind"] == "table"
        ]
        output.append({
            "grade": plan["grade"], "semester": plan["semester"], "week_rows": len(plan["weeks"]),
            "distinct_weeks": len(plan["canonical_weeks"]),
            "rubric_criteria": sum(len(r["criteria"]) for r in plan["rubrics"]),
            "rubric_level_pairs": sum(len(c["levels"]) for r in plan["rubrics"] for c in r["criteria"]),
            "tables": len(tables), "cells": sum(len(t["cells"]) for t in tables),
            "merged_cells": sum(
                c["colspan"] > 1 or c["rowspan"] > 1 for t in tables for c in t["cells"]
            ),
            "rubric_tables": sum(
                any(c["row"] == c["col"] == 0 and re.sub(r"\s+", "", c["text"]) == "평가시기" for c in t["cells"])
                for t in tables
            ),
        })
    return output


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("files", nargs="+", type=Path)
    cli.add_argument("--private-output", type=Path,
                     help="원문 내용을 담을 내부 검증용 JSON. 배포 자료에 포함하지 않습니다.")
    args = cli.parse_args()
    sources = [read_source(path) for path in args.files]
    if args.private_output:
        args.private_output.write_text(json.dumps(sources, ensure_ascii=False, indent=2))
        args.private_output.chmod(0o600)
    print(json.dumps([row for source in sources for row in inventory(source)], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
