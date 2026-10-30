#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把教务系统导出的「学生个人课表」转换成本系统可导入的 JSON。

用途：每个新学期拿到理论课表（xls/csv）后，生成一份 JSON，
      在网页「设置 → 导入 JSON」里导入到对应学期，不必手抄。

先决条件
--------
脚本读 CSV（UTF-8）。教务导出的 .xls 请先转成 CSV：

  A. 用 Excel / WPS 打开 → 另存为 → 选「CSV UTF-8」
  B. 或用 LibreOffice 命令行：
     soffice --headless --convert-to 'csv:Text - txt - csv (StarCalc):44,34,76' 学生个人课表.xls

用法
----
  python tools/build_schedule.py --csv kebiao.csv --term 2026S2 --start 2027-03-01 -o 2026S2.json
  python tools/build_schedule.py --csv kebiao.csv --term 2026S2 --start 2027-03-01 --weeks 20

参数
----
  --csv     理论课表 CSV 路径
  --term    学期 key，形如 2026S1 / 2026S2（年级 + 学期序号）
  --start   该学期「第 1 周周一」的日期，YYYY-MM-DD
  --weeks   学期总周数，默认 20
  --label   学期显示名，默认由 term 自动生成
  -o        输出 JSON 路径，默认 <term>.json
"""

import argparse
import csv
import io
import json
import re

DAY_NAMES = {1: "星期一", 2: "星期二", 3: "星期三", 4: "星期四", 5: "星期五", 6: "星期六", 7: "星期日"}


def parse_weeks(text):
    """'4,7-8,11-17' -> {4,7,8,11..17}"""
    weeks = set()
    for part in re.split(r"[,，\s]+", text.strip()):
        if not part:
            continue
        m = re.match(r"^(\d+)\s*-\s*(\d+)$", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if a > b:
                a, b = b, a
            weeks.update(range(a, b + 1))
        elif part.isdigit():
            weeks.add(int(part))
    return weeks


def parse_periods(text):
    """'[03-04-05]节' -> [3,4,5]"""
    m = re.search(r"\[([0-9\-]+)\]", text)
    if not m:
        return []
    return [int(x) for x in m.group(1).split("-") if x.strip().isdigit()]


def parse_cell(text):
    """一个格子里可能有多个条目，空行分隔；每条 = 课程/教师/周次/教室/节次"""
    if not text or not text.strip():
        return []
    blocks = re.split(r"\n\s*\n", text.replace("\r\n", "\n").strip())
    out = []
    for block in blocks:
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        if len(lines) < 4:
            continue
        name, teacher, weeks_raw = lines[0], lines[1], lines[2]
        room, period_line = "", ""
        for line in lines[3:]:
            if "[" in line and "]" in line:
                period_line = line
            elif not room:
                room = line
        weeks = parse_weeks(re.sub(r"\[.*?\]", "", weeks_raw))
        periods = parse_periods(period_line)
        if not name or not weeks or not periods:
            continue
        out.append({
            "name": name,
            "teacher": teacher,
            "room": room,
            "periods": periods,
            "weeks": sorted(weeks),
        })
    return out


def read_units(csv_path):
    with io.open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    units, seen = [], set()
    # 第 4 行起为节次行；第 2~8 列对应星期一到星期日
    for r in range(3, len(rows)):
        row = rows[r]
        if not row:
            continue
        for c in range(1, 8):
            cell = row[c] if c < len(row) else ""
            for item in parse_cell(cell):
                key = (item["name"], c, tuple(item["periods"]), item["room"], tuple(item["weeks"]))
                if key in seen:
                    continue
                seen.add(key)
                item["day"] = c
                units.append(item)
    units.sort(key=lambda u: (u["day"], u["periods"][0], u["name"]))
    return units


def build_schedule(units, total_weeks):
    schedule = {}
    for week in range(1, total_weeks + 1):
        day_units = [
            {
                "name": u["name"],
                "credits": u.get("credits", 0),
                "attr": u.get("attr", "必修"),
                "teacher": u["teacher"],
                "room": u["room"],
                "day": u["day"],
                "periods": u["periods"],
            }
            for u in units if week in u["weeks"]
        ]
        schedule[str(week)] = day_units
    return schedule


def main():
    parser = argparse.ArgumentParser(description="教务理论课表 CSV → 本系统可导入的 JSON")
    parser.add_argument("--csv", required=True, help="理论课表 CSV（UTF-8）")
    parser.add_argument("--term", required=True, help="学期 key，如 2026S2")
    parser.add_argument("--start", required=True, help="第 1 周周一，YYYY-MM-DD")
    parser.add_argument("--weeks", type=int, default=20, help="总周数，默认 20")
    parser.add_argument("--label", default="", help="学期显示名")
    parser.add_argument("-o", "--out", default="", help="输出 JSON 路径")
    args = parser.parse_args()

    m = re.match(r"^(\d{4})S(\d)$", args.term)
    if not m:
        raise SystemExit("--term 需要形如 2026S1（4 位年份 + S + 学期序号）")
    grade, index = int(m.group(1)), int(m.group(2))
    label = args.label or f"{grade} 级 · 第 {index} 学期"

    units = read_units(args.csv)
    if not units:
        raise SystemExit("没解析出任何课程，检查 CSV 是否为教务导出的个人课表")

    schedule = build_schedule(units, args.weeks)
    payload = {
        "app": "jwxt-timetable",
        "version": 3,
        "model": "weekly-terms",
        "activeTerm": args.term,
        "terms": {
            args.term: {
                "key": args.term,
                "grade": grade,
                "index": index,
                "label": label,
                "termStart": args.start,
                "totalWeeks": args.weeks,
                "events": [],
                "schedule": schedule,
            }
        },
    }

    out = args.out or f"{args.term}.json"
    with io.open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    total_periods = sum(len(u["periods"]) for w in schedule.values() for u in w)
    print(f"学期：{label}（{args.term}）")
    print(f"单元：{len(units)} 个，共 {sum(len(v) for v in schedule.values())} 个周次条目 / {total_periods} 小节")
    print("每周：" + " ".join(f"{w}:{len(schedule[w])}" for w in schedule))
    print(f"已生成：{out}")
    print("下一步：网页「设置 → 导入 JSON」选择该文件即可。")


if __name__ == "__main__":
    main()
