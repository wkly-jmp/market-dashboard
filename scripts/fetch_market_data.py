from __future__ import annotations

import csv
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "latest.json"
HISTORY_OUTPUT = ROOT / "data" / "history.json"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d"
TREASURY_CSV_URL = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?field_tdr_date_value={year}&type={rate_type}&page&_format=csv"
CNN_FEAR_GREED_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
STOOQ_USDJPY_URL = "https://stooq.com/q/l/?s=usdjpy&f=sd2t2ohlcv&h&e=csv"
STOOQ_DAILY_URL = "https://stooq.com/q/d/l/?s={symbol}&i=d&d1={start}"
FRANKFURTER_USDJPY_URL = "https://api.frankfurter.app/latest?from=USD&to=JPY"
FRANKFURTER_USDJPY_SERIES_URL = "https://api.frankfurter.app/{start}..?from=USD&to=JPY"
YAHOO_TIMEOUT_SECONDS = 30
TREASURY_TIMEOUT_SECONDS = 30

YAHOO_SERIES = {
    "vix": "%5EVIX",
    "sp500": "%5EGSPC",
    "nasdaq100": "%5ENDX",
    "oil": "CL%3DF",
    "hyg": "HYG",
    "ief": "IEF",
}

OPTIONAL_YAHOO_SERIES = {
    "gold": "GC%3DF",
    "spy": "SPY",
    "qqq": "QQQ",
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

    for name, symbol in OPTIONAL_YAHOO_SERIES.items():
        try:
            raw[name] = fetch_yahoo_series(symbol)
        except Exception as exc:
            warnings.append(f"Optional Yahoo Finance {name} fetch failed: {exc}")

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

    try:
        fear_greed = fetch_fear_greed(warnings)
        usdjpy_quote = fetch_usdjpy_quote(previous, warnings)
        try:
            raw["usdjpy_series"] = fetch_stooq_daily_series("usdjpy")
        except Exception as exc:
            try:
                raw["usdjpy_series"] = fetch_frankfurter_usdjpy_series()
            except Exception as fallback_exc:
                warnings.append(f"USDJPY history fetch failed: Stooq {exc}; Frankfurter {fallback_exc}")
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


def ratio_series(numerator: list[tuple[datetime, float]], denominator: list[tuple[datetime, float]]) -> list[tuple[datetime, float]]:
    denominator_by_date = {date.date(): value for date, value in denominator if value != 0}
    rows: list[tuple[datetime, float]] = []

    for date, numerator_value in numerator:
        denominator_value = denominator_by_date.get(date.date())
        if denominator_value is None:
            continue
        ratio = numerator_value / denominator_value
        if math.isfinite(ratio):
            rows.append((date, ratio))

    if not rows:
        raise RuntimeError("Ratio series has no overlapping rows")

    return rows


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


def fetch_stooq_daily_series(symbol: str) -> list[tuple[datetime, float]]:
    start = (datetime.now(timezone.utc) - timedelta(days=420)).strftime("%Y%m%d")
    url = STOOQ_DAILY_URL.format(symbol=symbol, start=start)
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=20) as response:
        text = response.read().decode("utf-8-sig")

    rows: list[tuple[datetime, float]] = []
    for row in csv.DictReader(text.splitlines()):
        date_text = row.get("Date")
        close_text = row.get("Close")
        if not date_text or close_text in (None, "", "N/D"):
            continue
        try:
            date = datetime.strptime(date_text, "%Y-%m-%d")
            value = float(close_text)
        except ValueError:
            continue
        if math.isfinite(value):
            rows.append((date, value))

    if not rows:
        raise RuntimeError(f"Stooq {symbol} has no usable rows")

    return rows


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


def fetch_frankfurter_usdjpy_series() -> list[tuple[datetime, float]]:
    start = (datetime.now(timezone.utc) - timedelta(days=420)).strftime("%Y-%m-%d")
    url = FRANKFURTER_USDJPY_SERIES_URL.format(start=start)
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=20) as response:
        data = json.loads(response.read().decode("utf-8"))

    rates = data.get("rates") or {}
    rows: list[tuple[datetime, float]] = []
    for date_text, currencies in rates.items():
        if not isinstance(currencies, dict) or "JPY" not in currencies:
            continue
        try:
            date = datetime.strptime(date_text, "%Y-%m-%d")
            value = float(currencies["JPY"])
        except ValueError:
            continue
        if math.isfinite(value):
            rows.append((date, value))

    rows.sort(key=lambda row: row[0])
    if not rows:
        raise RuntimeError("Frankfurter USDJPY history has no usable rows")

    return rows


def build_payload(raw: dict[str, list[tuple[datetime, float]]], fear_greed: dict | None, usdjpy_quote: dict, warnings: list[str], previous: dict | None) -> dict:
    now_utc = datetime.now(timezone.utc)
    now_jst = now_utc.astimezone(ZoneInfo("Asia/Tokyo"))

    vix_date, vix = latest(raw["vix"])
    sp_date, sp = latest(raw["sp500"])
    nasdaq_date, nasdaq = latest(raw["nasdaq100"])
    us10y_date, us10y = latest_or_previous(raw, "us10y", previous)
    usdjpy = usdjpy_quote["value"]
    real_yield_date, real_yield = latest_or_previous(raw, "real_yield", previous, "realYield")
    curve_date, yield_curve = latest_or_previous(raw, "yield_curve", previous, "yieldCurve")
    oil_date, oil = latest(raw["oil"])
    credit_ratio = ratio_series(raw["hyg"], raw["ief"])
    credit_date, credit_value = latest(credit_ratio)

    sp_ma = moving_average(raw["sp500"], 200)
    nasdaq_ma = moving_average(raw["nasdaq100"], 200)
    oil_ma = moving_average(raw["oil"], 200)
    credit_ma = moving_average(credit_ratio, 200)
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
        "creditTrend": round((credit_value / credit_ma - 1) * 100, 2),
        "realYield": round(real_yield, 3),
        "yieldCurve": round(yield_curve, 3),
        "oilDeviation": round((oil / oil_ma - 1) * 100, 2),
    }

    if fear_greed:
        values["fearGreed"] = round(fear_greed["score"], 2)
        if fear_greed["previous_1_month"] is not None:
            values["fearGreedChange"] = round(fear_greed["score"] - fear_greed["previous_1_month"], 2)

    derived = build_derived(raw, credit_ratio)
    missing_derived = [key for key, value in derived.items() if value is None]
    if missing_derived:
        warnings.append("派生指標の一部は元データ不足のため判定から除外: " + ", ".join(missing_derived))

    scores = calculate_market_scores(values, derived)
    regime = decide_market_regime(values, derived, scores, missing_derived)

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
        "creditTrend": source("YAHOO:HYG/IEF 200d deviation", credit_date, "Yahoo Finance"),
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
        "derived": derived,
        "scores": scores,
        "regime": regime,
        "sources": sources,
        "warnings": warnings,
    }


def build_derived(raw: dict[str, list[tuple[datetime, float]]], credit_ratio: list[tuple[datetime, float]]) -> dict:
    qqq_spy_ratio = optional_ratio(raw.get("qqq"), raw.get("spy"))
    return {
        "vixChange5d": optional_metric(lambda: series_point_change(raw["vix"], 5)),
        "vixChange10d": optional_metric(lambda: series_point_change(raw["vix"], 10)),
        "vixDrawdownFrom10dHigh": optional_metric(lambda: drawdown_from_high(raw["vix"], 10)),
        "vixDrawdownFrom20dHigh": optional_metric(lambda: drawdown_from_high(raw["vix"], 20)),
        "sp500Change5d": optional_metric(lambda: series_percent_change(raw["sp500"], 5)),
        "sp500Change10d": optional_metric(lambda: series_percent_change(raw["sp500"], 10)),
        "nasdaq100Change5d": optional_metric(lambda: series_percent_change(raw["nasdaq100"], 5)),
        "nasdaq100Change10d": optional_metric(lambda: series_percent_change(raw["nasdaq100"], 10)),
        "sp500NoNewLow3d": optional_bool(lambda: no_new_low_3d(raw["sp500"])),
        "nasdaq100NoNewLow3d": optional_bool(lambda: no_new_low_3d(raw["nasdaq100"])),
        "creditTrend5d": optional_metric(lambda: series_percent_change(credit_ratio, 5)),
        "creditTrend10d": optional_metric(lambda: series_percent_change(credit_ratio, 10)),
        "creditTrend20d": optional_metric(lambda: series_percent_change(credit_ratio, 20)),
        "creditDrawdownFrom20dHigh": optional_metric(lambda: drawdown_from_high(credit_ratio, 20)),
        "usdJpyChange5d": optional_metric(lambda: series_percent_change(raw["usdjpy_series"], 5)),
        "usdJpyChange20d": optional_metric(lambda: series_percent_change(raw["usdjpy_series"], 20)),
        "goldChange20d": optional_metric(lambda: series_percent_change(raw["gold"], 20)),
        "oilChange20d": optional_metric(lambda: series_percent_change(raw["oil"], 20)),
        "qqqSpyChange5d": optional_metric(lambda: series_percent_change(qqq_spy_ratio, 5)),
        "qqqSpyChange20d": optional_metric(lambda: series_percent_change(qqq_spy_ratio, 20)),
    }


def optional_ratio(numerator: list[tuple[datetime, float]] | None, denominator: list[tuple[datetime, float]] | None) -> list[tuple[datetime, float]]:
    if not numerator or not denominator:
        return []
    try:
        return ratio_series(numerator, denominator)
    except RuntimeError:
        return []


def optional_metric(callback) -> float | None:
    try:
        value = callback()
    except Exception:
        return None
    return safe_round(value)


def optional_bool(callback) -> bool | None:
    try:
        return bool(callback())
    except Exception:
        return None


def safe_round(value: float | None, digits: int = 2) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, digits)


def series_point_change(rows: list[tuple[datetime, float]], periods: int) -> float:
    if len(rows) <= periods:
        raise RuntimeError("Not enough rows for point change")
    return rows[-1][1] - rows[-1 - periods][1]


def series_percent_change(rows: list[tuple[datetime, float]], periods: int) -> float:
    if len(rows) <= periods:
        raise RuntimeError("Not enough rows for percent change")
    previous = rows[-1 - periods][1]
    if previous == 0:
        raise RuntimeError("Previous value is zero")
    return (rows[-1][1] / previous - 1) * 100


def drawdown_from_high(rows: list[tuple[datetime, float]], window: int) -> float:
    if len(rows) < window:
        raise RuntimeError("Not enough rows for drawdown")
    values = [value for _, value in rows[-window:]]
    high = max(values)
    if high == 0:
        raise RuntimeError("High value is zero")
    return (values[-1] / high - 1) * 100


def no_new_low_3d(rows: list[tuple[datetime, float]], lookback: int = 20) -> bool:
    if len(rows) < lookback + 3:
        raise RuntimeError("Not enough rows for new-low check")
    recent_values = [value for _, value in rows[-3:]]
    prior_values = [value for _, value in rows[-lookback - 3:-3]]
    return min(recent_values) > min(prior_values)


def calculate_market_scores(values: dict, derived: dict) -> dict:
    panic_score = average_score([
        (score_low(number_from(values, "fearGreed"), [(15, 95), (25, 78), (40, 48)], 18), 1.1),
        (score_high(number_from(values, "vix"), [(40, 95), (32, 78), (25, 58), (20, 38)], 18), 1.2),
        (score_low(number_from(values, "spDeviation"), [(-15, 92), (-8, 68), (-3, 42)], 16), 0.9),
        (score_low(number_from(values, "nasdaqDeviation"), [(-20, 95), (-12, 72), (-4, 44)], 16), 0.9),
        (score_low(number_from(derived, "sp500Change10d"), [(-12, 92), (-6, 68), (-3, 45)], 16), 0.8),
        (score_low(number_from(derived, "nasdaq100Change10d"), [(-15, 95), (-8, 70), (-4, 46)], 16), 0.8),
    ])

    peak_out_score = average_score([
        (score_low(number_from(derived, "vixDrawdownFrom10dHigh"), [(-22, 88), (-12, 72), (-5, 55)], 18), 1.1),
        (score_low(number_from(derived, "vixChange5d"), [(-8, 88), (-3, 70), (-0.1, 55)], 20), 1.0),
        (score_low(number_from(derived, "vixChange10d"), [(-10, 86), (-4, 68), (-0.1, 52)], 22), 0.8),
        (bool_score(derived.get("sp500NoNewLow3d"), 68, 18), 0.8),
        (bool_score(derived.get("nasdaq100NoNewLow3d"), 68, 18), 0.8),
        (score_high(number_from(derived, "sp500Change5d"), [(2, 72), (0, 60), (-2, 48)], 22), 0.7),
        (score_high(number_from(derived, "creditTrend5d"), [(1, 72), (0, 58), (-0.5, 48)], 22), 1.0),
        (score_high(number_from(values, "fearGreedChange"), [(15, 78), (5, 62), (0, 50)], 25), 0.7),
    ])

    pre_crash_risk_score = average_score([
        (score_high(number_from(values, "spDeviation"), [(18, 92), (12, 72), (8, 55)], 24), 0.9),
        (score_high(number_from(values, "nasdaqDeviation"), [(25, 95), (15, 76), (10, 58)], 24), 0.9),
        (score_low(number_from(values, "vix"), [(13, 72), (16, 52)], 22), 0.4),
        (score_high(number_from(derived, "vixChange5d"), [(5, 78), (2, 58), (0, 42)], 24), 0.8),
        (score_low(number_from(derived, "creditTrend5d"), [(-2, 82), (-0.8, 62), (-0.1, 45)], 24), 1.0),
        (score_low(number_from(derived, "creditTrend10d"), [(-3, 84), (-1.2, 64), (-0.2, 45)], 24), 0.9),
        (score_high(number_from(values, "us10yChange"), [(30, 72), (15, 55)], 24), 0.6),
        (relative_strength_warning(derived), 0.6),
    ])

    rate_bear_score = average_score([
        (score_high(number_from(values, "us10yChange"), [(30, 88), (15, 68), (5, 48)], 22), 1.2),
        (score_high(number_from(values, "us10y"), [(4.8, 78), (4.3, 58), (4.0, 44)], 24), 0.8),
        (score_high(number_from(values, "realYield"), [(2.2, 78), (1.7, 60), (1.2, 42)], 24), 0.9),
        (score_low(number_from(values, "nasdaqDeviation"), [(-12, 86), (-4, 62), (0, 42)], 20), 0.9),
        (score_low(number_from(derived, "nasdaq100Change10d"), [(-8, 76), (-4, 58), (-1, 42)], 22), 0.7),
        (score_low(number_from(derived, "creditTrend5d"), [(-1.5, 68), (-0.5, 48)], 24), 0.5),
    ])

    credit_stress_score = average_score([
        (score_low(number_from(values, "creditTrend"), [(-6, 92), (-2, 68), (0, 45)], 20), 1.2),
        (score_low(number_from(derived, "creditTrend5d"), [(-2, 86), (-0.8, 64), (-0.1, 45)], 20), 1.0),
        (score_low(number_from(derived, "creditTrend10d"), [(-3, 88), (-1.2, 66), (-0.2, 45)], 20), 1.0),
        (score_low(number_from(derived, "creditDrawdownFrom20dHigh"), [(-5, 82), (-2, 62), (-0.5, 44)], 20), 0.9),
        (score_high(number_from(values, "vix"), [(35, 78), (28, 60), (22, 42)], 18), 0.5),
    ])

    return {
        "panicScore": panic_score,
        "peakOutScore": peak_out_score,
        "preCrashRiskScore": pre_crash_risk_score,
        "rateBearScore": rate_bear_score,
        "creditStressScore": credit_stress_score,
    }


def decide_market_regime(values: dict, derived: dict, scores: dict, missing_derived: list[str]) -> dict:
    core_keys = ["vix", "spDeviation", "nasdaqDeviation", "us10y", "us10yChange", "creditTrend", "realYield", "yieldCurve"]
    core_count = sum(1 for key in core_keys if number_from(values, key) is not None)
    warnings = []
    if missing_derived:
        warnings.append("一部の派生指標は未取得のため、該当スコアから除外しています。")

    panic = score_value(scores, "panicScore")
    peak_out = score_value(scores, "peakOutScore")
    pre_crash = score_value(scores, "preCrashRiskScore")
    rate_bear = score_value(scores, "rateBearScore")
    credit_stress = score_value(scores, "creditStressScore")
    vix_change_5d = number_from(derived, "vixChange5d")
    credit_5d = number_from(derived, "creditTrend5d")
    sp_no_low = derived.get("sp500NoNewLow3d") is True
    nasdaq_no_low = derived.get("nasdaq100NoNewLow3d") is True

    if core_count < 6:
        return regime_payload(
            "data_quality_hold",
            "データ品質確認",
            "維持",
            "主要データ不足のため新規判断は保留",
            ["主要自動指標が6件未満です。"],
            warnings,
        )

    if credit_stress >= 68 and panic >= 50 and peak_out < 58:
        return regime_payload(
            "credit_crisis",
            "信用危機継続",
            "縮小",
            "現金余力優先。反発狙いは極小に限定",
            ["HYG/IEFの悪化が強く、恐怖が底打ち確認を上回っています。"],
            warnings,
        )

    if rate_bear >= 64 and credit_stress >= 35 and peak_out < 62:
        return regime_payload(
            "rate_bear",
            "金利主導ベア",
            "維持" if rate_bear < 74 else "やや縮小",
            "金利低下またはグロース回復確認まで拡大を急がない",
            ["金利・実質金利の圧力が、株式の短期回復を抑えています。"],
            warnings,
        )

    if pre_crash >= 64:
        return regime_payload(
            "pre_crash_risk",
            "過熱・内部劣化",
            "やや縮小",
            "利益確定とサイズ調整を優先",
            ["上方乖離が大きい一方で、VIXまたは信用選好に悪化の兆しがあります。"],
            warnings,
        )

    if panic >= 64 and peak_out >= 64 and credit_stress < 60 and (sp_no_low or nasdaq_no_low) and (credit_5d is None or credit_5d >= -0.5) and (vix_change_5d is None or vix_change_5d < 0):
        return regime_payload(
            "buyable_fear",
            "買える恐怖",
            "やや拡大",
            "打診のみ。追加はVIX低下、信用改善、指数回復の継続待ち",
            ["恐怖は強いものの、VIX低下・安値更新停止・信用選好の下げ止まりがそろっています。"],
            warnings,
        )

    if panic >= 45 and peak_out >= 55 and credit_stress < 68:
        return regime_payload(
            "recovering_stress",
            "悲観だが回復中",
            "やや拡大",
            "分割。信用悪化の再燃時は追加停止",
            ["悲観は残りますが、回復確認の指標が優勢です。"],
            warnings,
        )

    if rate_bear >= 45 and peak_out < 45:
        return regime_payload(
            "caution",
            "警戒・様子見",
            "維持",
            "金利圧力と回復確認の弱さが残るため、無理に増やさない",
            ["金利系の圧力が残り、VIXピークアウトや短期回復の確認が弱いです。"],
            warnings,
        )

    return fallback_three_axis_regime(values, warnings)


def fallback_three_axis_regime(values: dict, warnings: list[str]) -> dict:
    heat = average_score([
        (score_high(number_from(values, "spDeviation"), [(14, 90), (8, 68), (4, 52)], 30), 1.0),
        (score_high(number_from(values, "nasdaqDeviation"), [(18, 92), (10, 70), (5, 52)], 30), 1.0),
        (score_high(number_from(values, "fearGreed"), [(75, 90), (55, 65), (45, 45)], 25), 0.8),
        (score_high(number_from(values, "creditTrend"), [(6, 78), (2, 58), (0, 42)], 25), 0.6),
        (score_high(number_from(values, "oilDeviation"), [(25, 68), (10, 52)], 35), 0.4),
    ]) or 0
    stress = average_score([
        (score_high(number_from(values, "vix"), [(35, 92), (25, 72), (18, 48)], 25), 1.1),
        (score_low(number_from(values, "fearGreed"), [(20, 78), (35, 56), (45, 42)], 20), 0.7),
        (score_high(number_from(values, "us10yChange"), [(30, 78), (15, 60), (5, 42)], 25), 0.7),
        (score_high(number_from(values, "realYield"), [(2.2, 76), (1.7, 58), (1.2, 42)], 25), 0.6),
        (score_low(number_from(values, "creditTrend"), [(-6, 84), (-2, 62), (0, 42)], 24), 0.9),
    ]) or 0
    recovery = average_score([
        (score_low(number_from(values, "vixChange"), [(-6, 82), (-2, 66), (0, 50)], 25), 1.0),
        (score_high(number_from(values, "fearGreedChange"), [(20, 82), (8, 66), (0, 50)], 22), 0.8),
        (score_high(number_from(values, "creditTrend"), [(4, 68), (2, 58), (0, 45)], 25), 0.8),
        (score_high(number_from(values, "spDeviation"), [(0, 46), (-3, 36)], 24), 0.4),
    ]) or 0

    if stress >= 72 and recovery < 45:
        return regime_payload("crisis", "危機警戒", "縮小", "急いで増やさず、防御と現金余力を優先", ["3軸判定でストレスが高く、回復確認が弱いです。"], warnings)
    if stress >= 58 and recovery >= 58:
        return regime_payload("recovering_stress", "悲観だが回復中", "やや拡大", "小さく分割。信用悪化の再燃時は追加停止", ["3軸判定でストレスは残る一方、回復確認が出ています。"], warnings)
    if heat >= 72 and stress >= 50:
        return regime_payload("overheat_fading", "過熱から失速", "やや縮小", "利益確定とサイズ調整を優先", ["3軸判定で過熱とストレス上昇が重なっています。"], warnings)
    if heat >= 72:
        return regime_payload("overheat", "過熱リスクオン", "維持", "新規追加は慎重に小さく", ["3軸判定で過熱寄りです。"], warnings)
    if heat < 45 and stress < 55 and recovery >= 55:
        return regime_payload("constructive", "健全な回復", "拡大", "通常の分割ペースを検討", ["3軸判定で過熱が低く、回復度が優勢です。"], warnings)
    if stress < 45 and 45 <= heat < 70:
        return regime_payload("risk_on", "通常のリスクオン", "維持", "追いかけすぎに注意しながら維持", ["3軸判定で市場環境は比較的安定しています。"], warnings)
    if stress >= 48 and recovery < 50:
        return regime_payload("caution", "警戒・様子見", "維持", "悪化が止まるまで無理に増やさない", ["3軸判定でストレスが残り、回復確認が弱いです。"], warnings)

    return regime_payload("neutral", "中立・維持", "維持", "強い方向感は限定的", ["3軸判定では強い方向感が限定的です。"], warnings)


def regime_payload(key: str, current: str, judgment: str, size_hint: str, reasons: list[str], warnings: list[str]) -> dict:
    return {
        "key": key,
        "current": current,
        "positionJudgment": judgment,
        "positionSizeHint": size_hint,
        "reasons": reasons,
        "warnings": warnings,
    }


def number_from(data: dict, key: str) -> float | None:
    value = data.get(key)
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def score_value(scores: dict, key: str) -> float:
    value = number_from(scores, key)
    return value if value is not None else 0.0


def average_score(parts: list[tuple[float | None, float]]) -> int | None:
    total = 0.0
    weight = 0.0
    for score, part_weight in parts:
        if score is None:
            continue
        total += score * part_weight
        weight += part_weight
    if weight == 0:
        return None
    return round(clamp(total / weight))


def score_high(value: float | None, rules: list[tuple[float, int]], default: int) -> int | None:
    if value is None:
        return None
    for threshold, score in rules:
        if value >= threshold:
            return score
    return default


def score_low(value: float | None, rules: list[tuple[float, int]], default: int) -> int | None:
    if value is None:
        return None
    for threshold, score in rules:
        if value <= threshold:
            return score
    return default


def bool_score(value: bool | None, true_score: int, false_score: int) -> int | None:
    if value is None:
        return None
    return true_score if value else false_score


def relative_strength_warning(derived: dict) -> int | None:
    qqq_spy = number_from(derived, "qqqSpyChange20d")
    sp500 = number_from(derived, "sp500Change10d")
    if qqq_spy is None or sp500 is None:
        return None
    if qqq_spy >= 4 and sp500 <= 0:
        return 72
    if qqq_spy >= 2 and sp500 <= 1:
        return 55
    return 24


def clamp(value: float, minimum: float = 0, maximum: float = 100) -> float:
    return max(minimum, min(maximum, value))


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


def source(series: str, date: datetime, source_name: str = "Market data") -> dict[str, str]:
    return {
        "series": series,
        "source": source_name,
        "date": date.strftime("%Y-%m-%d"),
    }


def source_for(raw: dict[str, list[tuple[datetime, float]]], raw_key: str, series: str, date: datetime, previous: dict | None, value_key: str | None = None, source_name: str = "Market data") -> dict[str, str]:
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
    for key in ("derived", "scores", "regime"):
        if key in payload:
            snapshot[key] = payload.get(key)

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
