from __future__ import annotations

import csv
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import sleep
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "latest.json"
HISTORY_OUTPUT = ROOT / "data" / "history.json"
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={start_date}"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d"
TREASURY_CSV_URL = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?field_tdr_date_value={year}&type={rate_type}&page&_format=csv"
CNN_FEAR_GREED_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
STOOQ_USDJPY_URL = "https://stooq.com/q/l/?s=usdjpy&f=sd2t2ohlcv&h&e=csv"
FRANKFURTER_USDJPY_URL = "https://api.frankfurter.app/latest?from=USD&to=JPY"
FRED_TIMEOUT_SECONDS = 12
FRED_RETRIES = 1
YAHOO_TIMEOUT_SECONDS = 30
TREASURY_TIMEOUT_SECONDS = 30

SERIES = {
    "credit_spread": "BAA10Y",
    "financial_stress": "STLFSI4",
}

FRED_VALUE_KEYS = {
    "credit_spread": "creditSpread",
    "financial_stress": "financialStress",
}

YAHOO_SERIES = {
    "vix": "%5EVIX",
    "sp500": "%5EGSPC",
    "nasdaq100": "%5ENDX",
    "oil": "CL%3DF",
}


def main() -> int:
    previous = load_previous()
    warnings: list[str] = []

    raw = {}
    for name, symbol in YAHOO_SERIES.items():
        try:
            raw[name] = fetch_yahoo_series(symbol)
        except Exception as exc:
            warnings.append(f"Yahoo Finance {name} fetch failed: {exc}")

    try:
        treasury_nominal = fetch_treasury_csv("daily_treasury_yield_curve")
        raw["us10y"] = [(date, values["10 Yr"]) for date, values in treasury_nominal]
        raw["yield_curve"] = [(date, values["10 Yr"] - values["2 Yr"]) for date, values in treasury_nominal]
    except Exception as exc:
        warnings.append(f"Treasury nominal rates fetch failed; using previous values: {exc}")

    try:
        treasury_real = fetch_treasury_csv("daily_treasury_real_yield_curve")
        raw["real_yield"] = [(date, values["10 Yr"]) for date, values in treasury_real]
    except Exception as exc:
        warnings.append(f"Treasury real yields fetch failed; using previous values: {exc}")

    for name, series in SERIES.items():
        try:
            raw[name] = fetch_series(series)
        except Exception as exc:
            value_key = FRED_VALUE_KEYS.get(name, name)
            if previous_value_for(previous, value_key) is not None:
                warnings.append(f"FRED {series} fetch failed; using previous value: {exc}")
            else:
                warnings.append(f"FRED {series} fetch failed: {exc}")

    try:
        fear_greed = fetch_fear_greed(warnings)
        usdjpy_quote = fetch_usdjpy_quote(previous, warnings)
        payload = build_payload(raw, fear_greed, usdjpy_quote, warnings, previous)
    except Exception as exc:
        warnings.append(f"Market data payload build failed: {exc}")
        payload = build_error_payload(previous, warnings)

    write_json(payload)
    update_history(payload)
    return 0


def fetch_yahoo_series(symbol: str) -> list[tuple[datetime, float]]:
    url = YAHOO_CHART_URL.format(symbol=symbol)
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=YAHOO_TIMEOUT_SECONDS) as response:
        data = json.loads(response.read().decode("utf-8"))

    result = (data.get("chart", {}).get("result") or [None])[0]
    if not result:
        raise RuntimeError("Yahoo response has no chart data")

    timestamps = result.get("timestamp") or []
    closes = (((result.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
    rows: list[tuple[datetime, float]] = []
    for timestamp, close in zip(timestamps, closes):
        if close is None:
            continue
        value = float(close)
        if not math.isfinite(value):
            continue
        date = datetime.fromtimestamp(int(timestamp), tz=timezone.utc).replace(tzinfo=None)
        rows.append((date, value))

    if not rows:
        raise RuntimeError("Yahoo response has no usable rows")

    return rows


def fetch_treasury_csv(rate_type: str) -> list[tuple[datetime, dict[str, float]]]:
    now = datetime.now(timezone.utc)
    years = [now.year, now.year - 1]
    result: dict[datetime, dict[str, float]] = {}

    for year in years:
        url = TREASURY_CSV_URL.format(year=year, rate_type=rate_type)
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=TREASURY_TIMEOUT_SECONDS) as response:
            text = response.read().decode("utf-8-sig")

        for row in csv.DictReader(text.splitlines()):
            date_text = row.get("Date")
            if not date_text:
                continue
            try:
                date = datetime.strptime(date_text, "%m/%d/%Y")
            except ValueError:
                continue

            values: dict[str, float] = {}
            for key, value_text in row.items():
                if key == "Date" or value_text in (None, "", "N/A"):
                    continue
                normalized_key = key.title().replace("Yr", "Yr")
                try:
                    value = float(value_text)
                except ValueError:
                    continue
                if math.isfinite(value):
                    values[normalized_key] = value

            if values:
                result[date] = values

    rows = sorted(result.items(), key=lambda item: item[0])
    if not rows:
        raise RuntimeError(f"{rate_type} has no usable rows")

    return rows


def fetch_series(series: str) -> list[tuple[datetime, float]]:
    start_date = (datetime.now(timezone.utc) - timedelta(days=900)).strftime("%Y-%m-%d")
    url = FRED_URL.format(series=series, start_date=start_date)
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})

    for attempt in range(1, FRED_RETRIES + 1):
        try:
            with urlopen(request, timeout=FRED_TIMEOUT_SECONDS) as response:
                text = response.read().decode("utf-8-sig")
            break
        except Exception as exc:
            if attempt >= FRED_RETRIES:
                raise RuntimeError(f"{series} fetch failed: {exc}") from exc
            sleep(5 * attempt)

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
        raise RuntimeError(f"{series} has no usable rows")

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
        warnings.append(f"Fear & Greed fetch failed: {exc}")
        return None


def fetch_usdjpy_quote(previous: dict | None, warnings: list[str]) -> dict:
    stooq = fetch_usdjpy_from_stooq()
    if stooq:
        return stooq

    frankfurter = fetch_usdjpy_from_frankfurter()
    if frankfurter:
        warnings.append("Stooq USDJPY fetch failed; using Frankfurter daily reference rate.")
        return frankfurter

    previous_value = previous_value_for(previous, "usdjpy")
    previous_source = previous_source_for(previous, "usdjpy")
    if previous_value is not None:
        warnings.append("USDJPY fetch failed; using previous value.")
        return {
            "value": previous_value,
            "source": previous_source.get("source", "Previous"),
            "series": previous_source.get("series", "USDJPY"),
            "date": previous_source.get("date", ""),
            "time": previous_source.get("time", ""),
        }

    raise RuntimeError("USDJPY fetch failed")


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


def build_payload(raw: dict[str, list[tuple[datetime, float]]], fear_greed: dict | None, usdjpy_quote: dict, warnings: list[str], previous: dict | None) -> dict:
    now_utc = datetime.now(timezone.utc)
    now_jst = now_utc.astimezone(ZoneInfo("Asia/Tokyo"))

    vix_date, vix = latest(raw["vix"])
    sp_date, sp = latest(raw["sp500"])
    nasdaq_date, nasdaq = latest(raw["nasdaq100"])
    us10y_date, us10y = latest_or_previous(raw, "us10y", previous)
    usdjpy = usdjpy_quote["value"]
    credit_date, credit_spread = latest_or_previous(raw, "credit_spread", previous, "creditSpread")
    stress_date, financial_stress = latest_or_previous(raw, "financial_stress", previous, "financialStress")
    real_yield_date, real_yield = latest_or_previous(raw, "real_yield", previous, "realYield")
    curve_date, yield_curve = latest_or_previous(raw, "yield_curve", previous, "yieldCurve")
    oil_date, oil = latest(raw["oil"])

    sp_ma = moving_average(raw["sp500"], 200)
    nasdaq_ma = moving_average(raw["nasdaq100"], 200)
    oil_ma = moving_average(raw["oil"], 200)
    if "us10y" in raw:
        _, us10y_month_ago = nearest_on_or_before(raw["us10y"], us10y_date - timedelta(days=30))
        us10y_change = round((us10y - us10y_month_ago) * 100, 1)
    else:
        us10y_change = previous_value_for(previous, "us10yChange")
    _, vix_month_ago = nearest_on_or_before(raw["vix"], vix_date - timedelta(days=30))

    values = {
        "vix": round(vix, 2),
        "vixChange": round(vix - vix_month_ago, 2),
        "spDeviation": round((sp / sp_ma - 1) * 100, 2),
        "nasdaqDeviation": round((nasdaq / nasdaq_ma - 1) * 100, 2),
        "us10y": round(us10y, 3),
        "us10yChange": round(us10y_change, 1) if us10y_change is not None else None,
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
        "vix": source("YAHOO:^VIX", vix_date, "Yahoo Finance"),
        "vixChange": source("YAHOO:^VIX", vix_date, "Yahoo Finance"),
        "spDeviation": source("YAHOO:^GSPC", sp_date, "Yahoo Finance"),
        "nasdaqDeviation": source("YAHOO:^NDX", nasdaq_date, "Yahoo Finance"),
        "us10y": source_for(raw, "us10y", "TREASURY_YIELD_CURVE:10 Yr", us10y_date, previous, source_name="U.S. Treasury"),
        "us10yChange": source_for(raw, "us10y", "TREASURY_YIELD_CURVE:10 Yr", us10y_date, previous, "us10yChange", "U.S. Treasury"),
        "usdjpy": usdjpy_source,
        "creditSpread": source_for(raw, "credit_spread", "BAA10Y", credit_date, previous, "creditSpread"),
        "financialStress": source_for(raw, "financial_stress", "STLFSI4", stress_date, previous, "financialStress"),
        "realYield": source_for(raw, "real_yield", "TREASURY_REAL_YIELD_CURVE:10 Yr", real_yield_date, previous, "realYield", "U.S. Treasury"),
        "yieldCurve": source_for(raw, "yield_curve", "TREASURY_YIELD_CURVE:10 Yr-2 Yr", curve_date, previous, "yieldCurve", "U.S. Treasury"),
        "oilDeviation": source("YAHOO:CL=F", oil_date, "Yahoo Finance"),
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


def latest_or_previous(raw: dict[str, list[tuple[datetime, float]]], raw_key: str, previous: dict | None, value_key: str | None = None) -> tuple[datetime, float]:
    if raw_key in raw and raw[raw_key]:
        return latest(raw[raw_key])

    key = value_key or raw_key
    value = previous_value_for(previous, key)
    source_info = previous_source_for(previous, key)
    date_text = source_info.get("date") or (previous or {}).get("updated_at", "")
    if value is None:
        raise RuntimeError(f"{key} value is unavailable")

    return parse_date_or_now(date_text), value


def previous_value_for(previous: dict | None, key: str) -> float | None:
    value = (previous or {}).get("values", {}).get(key)
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def previous_source_for(previous: dict | None, key: str) -> dict:
    source_info = (previous or {}).get("sources", {}).get(key)
    return source_info if isinstance(source_info, dict) else {}


def moving_average(rows: list[tuple[datetime, float]], window: int) -> float:
    if len(rows) < window:
        raise RuntimeError(f"Not enough rows for {window}-day moving average")

    values = [value for _, value in rows[-window:]]
    return sum(values) / len(values)


def nearest_on_or_before(rows: list[tuple[datetime, float]], target: datetime) -> tuple[datetime, float]:
    candidates = [row for row in rows if row[0] <= target]
    if not candidates:
        raise RuntimeError("No data on or before target date")
    return candidates[-1]


def source(series: str, date: datetime, source_name: str = "FRED") -> dict[str, str]:
    return {
        "series": series,
        "source": source_name,
        "date": date.strftime("%Y-%m-%d"),
    }


def source_for(raw: dict[str, list[tuple[datetime, float]]], raw_key: str, series: str, date: datetime, previous: dict | None, value_key: str | None = None, source_name: str = "FRED") -> dict[str, str]:
    if raw_key in raw:
        return source(series, date, source_name)

    previous_source = previous_source_for(previous, value_key or raw_key)
    if previous_source:
        result = dict(previous_source)
        base_source = result.get("source", "Previous").split(" (", 1)[0]
        result["source"] = base_source + " (previous value)"
        return result

    return source(series, date, "Previous")


def parse_date_or_now(date_text: str) -> datetime:
    if date_text:
        try:
            return datetime.fromisoformat(date_text.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
        try:
            return datetime.strptime(date_text[:10], "%Y-%m-%d")
        except ValueError:
            pass
    return datetime.now(timezone.utc).replace(tzinfo=None)


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
        payload["status"] = "ok" if payload.get("values") else "error"
        payload["fetch_attempted_at"] = now_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z")
        payload["fetch_attempted_at_jst"] = now_jst.strftime("%Y-%m-%d %H:%M")
        if payload.get("values"):
            warnings = ["Latest fetch failed; showing previous data."] + warnings
        payload["warnings"] = warnings
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
