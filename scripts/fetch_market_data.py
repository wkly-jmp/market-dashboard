from __future__ import annotations

import csv
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "latest.json"
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}"

SERIES = {
    "vix": "VIXCLS",
    "sp500": "SP500",
    "nasdaq100": "NASDAQ100",
    "us10y": "DGS10",
    "usdjpy": "DEXJPUS",
}


def main() -> int:
    previous = load_previous()
    warnings: list[str] = []

    try:
        raw = {name: fetch_series(series) for name, series in SERIES.items()}
        payload = build_payload(raw)
        write_json(payload)
        return 0
    except Exception as exc:
        warnings.append(f"FRED取得に失敗しました: {exc}")
        payload = build_error_payload(previous, warnings)
        write_json(payload)
        return 0


def fetch_series(series: str) -> list[tuple[datetime, float]]:
    url = FRED_URL.format(series=series)
    try:
        with urlopen(url, timeout=30) as response:
            text = response.read().decode("utf-8-sig")
    except URLError as exc:
        raise RuntimeError(f"{series} を取得できませんでした: {exc}") from exc

    rows = csv.DictReader(text.splitlines())
    result: list[tuple[datetime, float]] = []
    for row in rows:
        date_text = row.get("observation_date") or row.get("DATE")
        value_text = row.get(series)
        if not date_text or value_text in (None, "", "."):
            continue

        try:
            value = float(value_text)
            if not math.isfinite(value):
                continue
            date = datetime.strptime(date_text, "%Y-%m-%d")
        except ValueError:
            continue

        result.append((date, value))

    if not result:
        raise RuntimeError(f"{series} の有効データがありません")

    return result


def build_payload(raw: dict[str, list[tuple[datetime, float]]]) -> dict:
    now_utc = datetime.now(timezone.utc)
    now_jst = now_utc.astimezone(ZoneInfo("Asia/Tokyo"))

    vix_date, vix = latest(raw["vix"])
    sp_date, sp = latest(raw["sp500"])
    nasdaq_date, nasdaq = latest(raw["nasdaq100"])
    us10y_date, us10y = latest(raw["us10y"])
    usdjpy_date, usdjpy = latest(raw["usdjpy"])

    sp_ma = moving_average(raw["sp500"], 200)
    nasdaq_ma = moving_average(raw["nasdaq100"], 200)
    _, us10y_month_ago = nearest_on_or_before(raw["us10y"], us10y_date - timedelta(days=30))

    values = {
        "vix": round(vix, 2),
        "spDeviation": round((sp / sp_ma - 1) * 100, 2),
        "nasdaqDeviation": round((nasdaq / nasdaq_ma - 1) * 100, 2),
        "us10y": round(us10y, 3),
        "us10yChange": round((us10y - us10y_month_ago) * 100, 1),
        "usdjpy": round(usdjpy, 3),
    }

    return {
        "updated_at": now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "updated_at_jst": now_jst.strftime("%Y-%m-%d %H:%M"),
        "status": "ok",
        "values": values,
        "sources": {
            "vix": source("VIXCLS", vix_date),
            "spDeviation": source("SP500", sp_date),
            "nasdaqDeviation": source("NASDAQ100", nasdaq_date),
            "us10y": source("DGS10", us10y_date),
            "us10yChange": source("DGS10", us10y_date),
            "usdjpy": source("DEXJPUS", usdjpy_date),
        },
        "warnings": [],
    }


def latest(rows: list[tuple[datetime, float]]) -> tuple[datetime, float]:
    return rows[-1]


def moving_average(rows: list[tuple[datetime, float]], window: int) -> float:
    if len(rows) < window:
        raise RuntimeError(f"{window}日移動平均に必要なデータが不足しています")

    values = [value for _, value in rows[-window:]]
    return sum(values) / len(values)


def nearest_on_or_before(rows: list[tuple[datetime, float]], target: datetime) -> tuple[datetime, float]:
    candidates = [row for row in rows if row[0] <= target]
    if not candidates:
        raise RuntimeError("1か月前の金利データがありません")
    return candidates[-1]


def source(series: str, date: datetime) -> dict[str, str]:
    return {
        "series": series,
        "source": "FRED",
        "date": date.strftime("%Y-%m-%d"),
    }


def build_error_payload(previous: dict | None, warnings: list[str]) -> dict:
    now_utc = datetime.now(timezone.utc)
    now_jst = now_utc.astimezone(ZoneInfo("Asia/Tokyo"))

    if previous:
        payload = dict(previous)
        payload["status"] = "error"
        payload["fetch_attempted_at"] = now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z")
        payload["fetch_attempted_at_jst"] = now_jst.strftime("%Y-%m-%d %H:%M")
        payload["warnings"] = warnings + previous.get("warnings", [])
        return payload

    return {
        "updated_at": None,
        "updated_at_jst": "",
        "fetch_attempted_at": now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "fetch_attempted_at_jst": now_jst.strftime("%Y-%m-%d %H:%M"),
        "status": "error",
        "values": {},
        "sources": {},
        "warnings": warnings,
    }


def load_previous() -> dict | None:
    if not OUTPUT.exists():
        return None

    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def write_json(payload: dict) -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
