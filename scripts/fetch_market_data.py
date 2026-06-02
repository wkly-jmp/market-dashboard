from __future__ import annotations

import csv
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "latest.json"
HISTORY_OUTPUT = ROOT / "data" / "history.json"
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={start_date}"
CNN_FEAR_GREED_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
STOOQ_USDJPY_URL = "https://stooq.com/q/l/?s=usdjpy&f=sd2t2ohlcv&h&e=csv"
FRANKFURTER_USDJPY_URL = "https://api.frankfurter.app/latest?from=USD&to=JPY"

SERIES = {
    "vix": "VIXCLS",
    "sp500": "SP500",
    "nasdaq100": "NASDAQ100",
    "us10y": "DGS10",
    "usdjpy_fred": "DEXJPUS",
    "credit_spread": "BAA10Y",
    "financial_stress": "STLFSI4",
    "real_yield": "DFII10",
    "yield_curve": "T10Y2Y",
    "oil": "DCOILWTICO",
}


def main() -> int:
    previous = load_previous()
    warnings: list[str] = []

    try:
        raw = {name: fetch_series(series) for name, series in SERIES.items()}
        fear_greed = fetch_fear_greed(warnings)
        usdjpy_quote = fetch_usdjpy_quote(raw["usdjpy_fred"], warnings)
        payload = build_payload(raw, fear_greed, usdjpy_quote, warnings)
        write_json(payload)
        update_history(payload)
        return 0
    except Exception as exc:
        warnings.append(f"FRED取得に失敗しました: {exc}")
        payload = build_error_payload(previous, warnings)
        write_json(payload)
        return 0


def fetch_series(series: str) -> list[tuple[datetime, float]]:
    start_date = (datetime.now(timezone.utc) - timedelta(days=900)).strftime("%Y-%m-%d")
    url = FRED_URL.format(series=series, start_date=start_date)
    try:
        with urlopen(url, timeout=45) as response:
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


def fetch_fear_greed(warnings: list[str]) -> dict | None:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://www.cnn.com/markets/fear-and-greed",
        "Origin": "https://www.cnn.com",
    }

    try:
        request = Request(CNN_FEAR_GREED_URL, headers=headers)
        with urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
        result = data.get("fear_and_greed") or {}
        score = float(result["score"])
        timestamp = result.get("timestamp")
        previous_month = result.get("previous_1_month")
        return {
            "score": score,
            "timestamp": timestamp,
            "previous_1_month": float(previous_month) if previous_month is not None else None,
            "rating": result.get("rating", ""),
        }
    except Exception as exc:
        warnings.append(f"Fear & Greed取得に失敗しました: {exc}")
        return None


def fetch_usdjpy_quote(fred_rows: list[tuple[datetime, float]], warnings: list[str]) -> dict:
    stooq = fetch_usdjpy_from_stooq()
    if stooq:
        return stooq

    frankfurter = fetch_usdjpy_from_frankfurter()
    if frankfurter:
        warnings.append("Stooqのドル円取得に失敗したため、Frankfurterの日次レートを使用しました。")
        return frankfurter

    date, value = latest(fred_rows)
    warnings.append("Stooq/Frankfurterのドル円取得に失敗したため、FRED DEXJPUSを使用しました。")
    return {
        "value": value,
        "source": "FRED",
        "series": "DEXJPUS",
        "date": date.strftime("%Y-%m-%d"),
    }


def fetch_usdjpy_from_stooq() -> dict | None:
    try:
        request = Request(STOOQ_USDJPY_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=20) as response:
            text = response.read().decode("utf-8-sig")
        rows = list(csv.DictReader(text.splitlines()))
        if not rows:
            return None
        row = rows[0]
        close = float(row["Close"])
        date = row.get("Date", "")
        time = row.get("Time", "")
        return {
            "value": close,
            "source": "Stooq",
            "series": "USDJPY",
            "date": date,
            "time": time,
        }
    except Exception:
        return None


def fetch_usdjpy_from_frankfurter() -> dict | None:
    try:
        request = Request(FRANKFURTER_USDJPY_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
        value = float(data["rates"]["JPY"])
        return {
            "value": value,
            "source": "Frankfurter",
            "series": "USDJPY_ECB_REFERENCE",
            "date": data.get("date", ""),
        }
    except Exception:
        return None


def build_payload(raw: dict[str, list[tuple[datetime, float]]], fear_greed: dict | None, usdjpy_quote: dict, warnings: list[str]) -> dict:
    now_utc = datetime.now(timezone.utc)
    now_jst = now_utc.astimezone(ZoneInfo("Asia/Tokyo"))

    vix_date, vix = latest(raw["vix"])
    sp_date, sp = latest(raw["sp500"])
    nasdaq_date, nasdaq = latest(raw["nasdaq100"])
    us10y_date, us10y = latest(raw["us10y"])
    usdjpy = usdjpy_quote["value"]
    credit_date, credit_spread = latest(raw["credit_spread"])
    stress_date, financial_stress = latest(raw["financial_stress"])
    real_yield_date, real_yield = latest(raw["real_yield"])
    curve_date, yield_curve = latest(raw["yield_curve"])
    oil_date, oil = latest(raw["oil"])

    sp_ma = moving_average(raw["sp500"], 200)
    nasdaq_ma = moving_average(raw["nasdaq100"], 200)
    oil_ma = moving_average(raw["oil"], 200)
    _, us10y_month_ago = nearest_on_or_before(raw["us10y"], us10y_date - timedelta(days=30))
    _, vix_month_ago = nearest_on_or_before(raw["vix"], vix_date - timedelta(days=30))

    values = {
        "vix": round(vix, 2),
        "vixChange": round(vix - vix_month_ago, 2),
        "spDeviation": round((sp / sp_ma - 1) * 100, 2),
        "nasdaqDeviation": round((nasdaq / nasdaq_ma - 1) * 100, 2),
        "us10y": round(us10y, 3),
        "us10yChange": round((us10y - us10y_month_ago) * 100, 1),
        "usdjpy": round(usdjpy, 4),
        "creditSpread": round(credit_spread, 3),
        "financialStress": round(financial_stress, 3),
        "realYield": round(real_yield, 3),
        "yieldCurve": round(yield_curve, 3),
        "oilDeviation": round((oil / oil_ma - 1) * 100, 2),
    }

    if fear_greed:
        values["fearGreed"] = round(fear_greed["score"], 2)
        if fear_greed["previous_1_month"] is not None:
            values["fearGreedChange"] = round(fear_greed["score"] - fear_greed["previous_1_month"], 2)

    usdjpy_source = {
        "series": usdjpy_quote["series"],
        "source": usdjpy_quote["source"],
        "date": usdjpy_quote["date"],
    }
    if usdjpy_quote.get("time"):
        usdjpy_source["time"] = usdjpy_quote["time"]

    sources = {
        "vix": source("VIXCLS", vix_date),
        "vixChange": source("VIXCLS", vix_date),
        "spDeviation": source("SP500", sp_date),
        "nasdaqDeviation": source("NASDAQ100", nasdaq_date),
        "us10y": source("DGS10", us10y_date),
        "us10yChange": source("DGS10", us10y_date),
        "usdjpy": usdjpy_source,
        "creditSpread": source("BAA10Y", credit_date),
        "financialStress": source("STLFSI4", stress_date),
        "realYield": source("DFII10", real_yield_date),
        "yieldCurve": source("T10Y2Y", curve_date),
        "oilDeviation": source("DCOILWTICO", oil_date),
    }

    if fear_greed:
        fear_date = parse_source_date(fear_greed.get("timestamp"))
        sources["fearGreed"] = {
            "series": "CNN_FEAR_GREED",
            "source": "CNN",
            "date": fear_date,
        }
        if "fearGreedChange" in values:
            sources["fearGreedChange"] = {
                "series": "CNN_FEAR_GREED",
                "source": "CNN",
                "date": fear_date,
            }

    return {
        "updated_at": now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "updated_at_jst": now_jst.strftime("%Y-%m-%d %H:%M"),
        "status": "ok",
        "values": values,
        "sources": sources,
        "warnings": warnings,
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


def parse_source_date(timestamp: str | None) -> str:
    if not timestamp:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        return datetime.fromisoformat(timestamp.replace("Z", "+00:00")).strftime("%Y-%m-%d")
    except ValueError:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")


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


def update_history(payload: dict) -> None:
    if payload.get("status") != "ok":
        return

    history = load_history()
    snapshot = {
        "updated_at": payload.get("updated_at"),
        "updated_at_jst": payload.get("updated_at_jst"),
        "values": payload.get("values", {}),
        "sources": payload.get("sources", {}),
    }

    history = [item for item in history if item.get("updated_at") != snapshot["updated_at"]]
    history.append(snapshot)
    history = history[-30:]

    HISTORY_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_OUTPUT.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_history() -> list[dict]:
    if not HISTORY_OUTPUT.exists():
        return []

    try:
        parsed = json.loads(HISTORY_OUTPUT.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


if __name__ == "__main__":
    sys.exit(main())
