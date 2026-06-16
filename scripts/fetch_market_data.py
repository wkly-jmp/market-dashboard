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
    "rsp": "RSP",
    "vix3m": "%5EVIX3M",
}

GUARDRAIL_CRITICAL_VALUE_IDS = (
    "vix",
    "spDeviation",
    "nasdaqDeviation",
    "creditTrend",
    "us10y",
    "realYield",
)

GUARDRAIL_DERIVED_IDS = (
    "vixChange5d",
    "vixDrawdownFrom10dHigh",
    "sp500Change5d",
    "sp500Change10d",
    "nasdaq100Change5d",
    "nasdaq100Change10d",
    "creditTrend5d",
    "creditTrend10d",
    "qqqSpyChange20d",
    "sp500NoNewLow3d",
    "nasdaq100NoNewLow3d",
)

GUARDRAIL_THRESHOLDS = {
    "addBlocked": {
        "creditStress": 68,
        "preCrash": 64,
        "rateBear": 64,
        "rateBearPeakOut": 62,
        "vixChange5d": 4,
        "sp500Change5d": -2,
        "nasdaq100Change5d": -3,
        "creditTrend5d": -0.8,
        "creditTrend10d": -1.2,
        "nasdaqDeviation": 18,
        "qqqSpyChange20d": 3,
        "sp500Change10d": 1,
        "heat": 72,
        "stress": 60,
    },
    "addCautious": {
        "vix": 18,
        "fearGreed": 35,
        "fearPeakOut": 55,
        "rateBear": 45,
        "ratePeakOut": 50,
        "heat": 65,
        "stress": 55,
    },
    "trimDefensive": {
        "creditStress": 68,
        "creditPeakOut": 58,
        "rateBear": 74,
        "ratePeakOut": 62,
        "creditTrend5d": -2,
        "creditTrend10d": -3,
    },
    "trimAvoid": {
        "creditStress": 60,
        "fearGreed": 25,
        "panic": 55,
        "vix": 25,
        "sp500Change10d": -5,
        "nasdaq100Change10d": -7,
        "peakOut": 50,
        "vixDrawdown": -5,
        "creditTrend5d": -0.5,
    },
    "trimCautious": {
        "fearGreed": 35,
        "panic": 45,
        "stress": 58,
        "creditStress": 68,
        "sp500Change5d": -3,
        "nasdaq100Change5d": -5,
    },
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
    axes = calculate_three_axis_scores(values)
    guardrails = build_guardrails(axes, values, derived, scores, regime)

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
        "guardrails": guardrails,
        "sources": sources,
        "warnings": warnings,
    }


def build_derived(raw: dict[str, list[tuple[datetime, float]]], credit_ratio: list[tuple[datetime, float]]) -> dict:
    qqq_spy_ratio = optional_ratio(raw.get("qqq"), raw.get("spy"))
    rsp_spy_ratio = optional_ratio(raw.get("rsp"), raw.get("spy"))
    selective = build_selective_defense(raw, credit_ratio, rsp_spy_ratio)
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
        **selective,
    }


def build_selective_defense(
    raw: dict[str, list[tuple[datetime, float]]],
    credit_ratio: list[tuple[datetime, float]],
    rsp_spy_ratio: list[tuple[datetime, float]],
) -> dict:
    required = ("sp500", "vix", "vix3m")
    if any(not raw.get(key) for key in required) or not credit_ratio or not rsp_spy_ratio:
        return empty_selective_defense()

    series_maps = {
        "sp500": {row_date.date(): value for row_date, value in raw["sp500"]},
        "vix": {row_date.date(): value for row_date, value in raw["vix"]},
        "vix3m": {row_date.date(): value for row_date, value in raw["vix3m"]},
        "credit": {row_date.date(): value for row_date, value in credit_ratio},
        "breadth": {row_date.date(): value for row_date, value in rsp_spy_ratio},
    }
    common_dates = sorted(set.intersection(*(set(values) for values in series_maps.values())))
    if len(common_dates) < 55:
        return empty_selective_defense()

    values = {
        key: [mapping[row_date] for row_date in common_dates]
        for key, mapping in series_maps.items()
    }
    active = False
    trigger_streak = 0
    release_streak = 0
    hold_days = 0
    latest = None

    for index in range(50, len(common_dates)):
        sp500 = values["sp500"][index]
        sp500_change5 = percent_change_at(values["sp500"], index, 5)
        sp500_drawdown20 = drawdown_at(values["sp500"], index, 20)
        sp500_ma20 = average_at(values["sp500"], index, 20)
        sp500_ma50 = average_at(values["sp500"], index, 50)
        vix_change5 = point_change_at(values["vix"], index, 5)
        vix_term = values["vix"][index] / values["vix3m"][index]
        credit_change5 = percent_change_at(values["credit"], index, 5)
        credit_ma20 = average_at(values["credit"], index, 20)
        breadth_change5 = percent_change_at(values["breadth"], index, 5)
        breadth_ma20 = average_at(values["breadth"], index, 20)

        price_risk = (
            sp500_drawdown20 <= -3.5
            and sp500_change5 <= -1.0
        ) or (
            sp500 < sp500_ma20
            and sp500 < sp500_ma50
            and sp500_change5 <= -1.0
        )
        volatility_risk = vix_change5 >= 2.5 or vix_term >= 1.0
        credit_risk = credit_change5 <= -0.5 and values["credit"][index] < credit_ma20
        breadth_risk = breadth_change5 <= -0.2 and values["breadth"][index] < breadth_ma20
        bad_count = sum((price_risk, volatility_risk, credit_risk, breadth_risk))
        risk = (
            price_risk
            and volatility_risk
            and (credit_risk or breadth_risk)
            and bad_count >= 3
        )
        trigger_streak = trigger_streak + 1 if risk else 0

        if not active:
            if trigger_streak >= 4:
                active = True
                hold_days = 1
                release_streak = 0
        else:
            hold_days += 1
            release_condition = (
                not risk
                and sp500 > sp500_ma20
                and vix_change5 <= 0
            )
            release_streak = release_streak + 1 if release_condition else 0
            if hold_days >= 3 and release_streak >= 2:
                active = False
                hold_days = 0
                trigger_streak = 0
                release_streak = 0

        latest = {
            "selectiveDefenseActive": active,
            "selectiveDefenseRisk": risk,
            "selectiveDefenseBadCount": bad_count,
            "selectiveDefenseRiskDays": trigger_streak,
            "selectivePriceRisk": price_risk,
            "selectiveVolatilityRisk": volatility_risk,
            "selectiveCreditRisk": credit_risk,
            "selectiveBreadthRisk": breadth_risk,
            "sp500Drawdown20d": sp500_drawdown20,
            "vixTermRatio": vix_term,
            "rspSpyChange5d": breadth_change5,
        }

    if latest is None:
        return empty_selective_defense()
    return {
        key: safe_round(value) if isinstance(value, float) else value
        for key, value in latest.items()
    }


def empty_selective_defense() -> dict:
    return {
        "selectiveDefenseActive": None,
        "selectiveDefenseRisk": None,
        "selectiveDefenseBadCount": None,
        "selectiveDefenseRiskDays": None,
        "selectivePriceRisk": None,
        "selectiveVolatilityRisk": None,
        "selectiveCreditRisk": None,
        "selectiveBreadthRisk": None,
        "sp500Drawdown20d": None,
        "vixTermRatio": None,
        "rspSpyChange5d": None,
    }


def average_at(values: list[float], index: int, periods: int) -> float:
    return sum(values[index - periods + 1:index + 1]) / periods


def percent_change_at(values: list[float], index: int, periods: int) -> float:
    previous = values[index - periods]
    if previous == 0:
        raise RuntimeError("Previous value is zero")
    return (values[index] / previous - 1) * 100


def point_change_at(values: list[float], index: int, periods: int) -> float:
    return values[index] - values[index - periods]


def drawdown_at(values: list[float], index: int, periods: int) -> float:
    high = max(values[index - periods + 1:index + 1])
    if high == 0:
        raise RuntimeError("High value is zero")
    return (values[index] / high - 1) * 100


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


def calculate_three_axis_scores(values: dict) -> dict:
    heat = average_score([
        (score_high(number_from(values, "spDeviation"), [(14, 90), (8, 68), (4, 52)], 30), 1.0),
        (score_high(number_from(values, "nasdaqDeviation"), [(18, 92), (10, 70), (5, 52)], 30), 1.0),
        (score_high(number_from(values, "fearGreed"), [(75, 90), (55, 65), (45, 45)], 25), 0.8),
        (score_high(number_from(values, "creditTrend"), [(6, 78), (2, 58), (0, 42)], 25), 0.6),
        (score_high(number_from(values, "oilDeviation"), [(25, 68), (10, 52)], 35), 0.4),
    ])
    stress = average_score([
        (score_high(number_from(values, "vix"), [(35, 92), (25, 72), (18, 48)], 25), 1.1),
        (score_low(number_from(values, "fearGreed"), [(20, 78), (35, 56), (45, 42)], 20), 0.7),
        (score_high(number_from(values, "us10yChange"), [(30, 78), (15, 60), (5, 42)], 25), 0.7),
        (score_high(number_from(values, "realYield"), [(2.2, 76), (1.7, 58), (1.2, 42)], 25), 0.6),
        (score_low(number_from(values, "creditTrend"), [(-6, 84), (-2, 62), (0, 42)], 24), 0.9),
    ])
    recovery = average_score([
        (score_low(number_from(values, "vixChange"), [(-6, 82), (-2, 66), (0, 50)], 25), 1.0),
        (score_high(number_from(values, "fearGreedChange"), [(20, 82), (8, 66), (0, 50)], 22), 0.8),
        (score_high(number_from(values, "creditTrend"), [(4, 68), (2, 58), (0, 45)], 25), 0.8),
        (score_high(number_from(values, "spDeviation"), [(0, 46), (-3, 36)], 24), 0.4),
    ])
    return {"heat": heat, "stress": stress, "recovery": recovery}


def build_guardrails(axes: dict, values: dict, derived: dict, scores: dict, regime: dict) -> dict:
    add_reasons: list[str] = []
    trim_reasons: list[str] = []
    warnings: list[str] = []
    add_blocked = GUARDRAIL_THRESHOLDS["addBlocked"]
    add_cautious = GUARDRAIL_THRESHOLDS["addCautious"]
    trim_defensive = GUARDRAIL_THRESHOLDS["trimDefensive"]
    trim_avoid = GUARDRAIL_THRESHOLDS["trimAvoid"]
    trim_cautious = GUARDRAIL_THRESHOLDS["trimCautious"]

    heat = number_from(axes, "heat")
    stress = number_from(axes, "stress")
    vix = number_from(values, "vix")
    fear_greed = number_from(values, "fearGreed")
    nasdaq_deviation = number_from(values, "nasdaqDeviation")
    vix_change_5d = number_from(derived, "vixChange5d")
    vix_drawdown = number_from(derived, "vixDrawdownFrom10dHigh")
    sp500_change_5d = number_from(derived, "sp500Change5d")
    sp500_change_10d = number_from(derived, "sp500Change10d")
    nasdaq_change_5d = number_from(derived, "nasdaq100Change5d")
    nasdaq_change_10d = number_from(derived, "nasdaq100Change10d")
    credit_5d = number_from(derived, "creditTrend5d")
    credit_10d = number_from(derived, "creditTrend10d")
    qqq_spy_20d = number_from(derived, "qqqSpyChange20d")
    panic = number_from(scores, "panicScore")
    peak_out = number_from(scores, "peakOutScore")
    pre_crash = number_from(scores, "preCrashRiskScore")
    rate_bear = number_from(scores, "rateBearScore")
    credit_stress = number_from(scores, "creditStressScore")
    regime_key = str(regime.get("key") or "")
    vix_sp_decline = (
        at_least(vix_change_5d, add_blocked["vixChange5d"])
        and at_most(sp500_change_5d, add_blocked["sp500Change5d"])
    )
    vix_nasdaq_decline = (
        at_least(vix_change_5d, add_blocked["vixChange5d"])
        and at_most(nasdaq_change_5d, add_blocked["nasdaq100Change5d"])
    )
    credit_trend_worsening = (
        at_most(credit_5d, add_blocked["creditTrend5d"])
        and at_most(credit_10d, add_blocked["creditTrend10d"])
    )
    vix_decline_confirmed = (
        (vix_sp_decline and vix_nasdaq_decline)
        or (
            (vix_sp_decline or vix_nasdaq_decline)
            and (
                credit_trend_worsening
                or regime_key == "selective_risk_watch"
                or at_least(stress, add_blocked["stress"])
            )
        )
    )
    credit_trend_confirmed = (
        credit_trend_worsening
        and (
            regime_key == "selective_risk_watch"
            or vix_sp_decline
            or vix_nasdaq_decline
            or at_least(stress, add_blocked["stress"])
        )
    )

    append_reason(add_reasons, regime_key == "selective_defense", "選択型防御が成立しているため、買い増しを止めます。")
    append_reason(add_reasons, regime_key == "credit_crisis", "信用危機判定中のため、買い増しを止めます。")
    append_reason(add_reasons, at_least(credit_stress, add_blocked["creditStress"]), "信用ストレスが高く、買い増しに不向きです。")
    append_reason(add_reasons, at_least(pre_crash, add_blocked["preCrash"]), "過熱・内部劣化の兆候が強まっています。")
    append_reason(
        add_reasons,
        at_least(rate_bear, add_blocked["rateBear"])
        and at_least(credit_stress, 35)
        and below(peak_out, add_blocked["rateBearPeakOut"]),
        "金利圧力と信用ストレスが重なり、底打ち確認も不足しています。",
    )
    append_reason(
        add_reasons,
        vix_sp_decline and vix_decline_confirmed,
        "VIX上昇とS&P500下落に、別の悪化条件も重なっています。",
    )
    append_reason(
        add_reasons,
        vix_nasdaq_decline and vix_decline_confirmed,
        "VIX上昇とNasdaq100下落に、別の悪化条件も重なっています。",
    )
    append_reason(
        add_reasons,
        credit_trend_confirmed,
        "信用選好の悪化に、価格・VIX・市場ストレスの裏付けがあります。",
    )
    append_reason(
        add_reasons,
        at_least(nasdaq_deviation, add_blocked["nasdaqDeviation"])
        and at_least(qqq_spy_20d, add_blocked["qqqSpyChange20d"])
        and at_most(sp500_change_10d, add_blocked["sp500Change10d"]),
        "Nasdaq主導の過熱に対して、S&P500の上昇が鈍っています。",
    )
    append_reason(
        add_reasons,
        at_least(heat, add_blocked["heat"]) and at_least(stress, add_blocked["stress"]),
        "過熱とストレスが同時に高まっています。",
    )

    add_permission = "blocked" if add_reasons else "normal"
    if add_permission != "blocked":
        append_reason(add_reasons, regime_key == "selective_risk_watch", "危機条件の継続確認中のため、買い増しを急ぎません。")
        append_reason(add_reasons, regime_key in ("caution", "overheat", "overheat_fading"), "現行局面は追加を急がない判定です。")
        append_reason(add_reasons, at_least(vix, add_cautious["vix"]) and above(vix_change_5d, 0), "VIXが18以上で、直近5日も上昇しています。")
        append_reason(
            add_reasons,
            at_most(fear_greed, add_cautious["fearGreed"]) and below(peak_out, add_cautious["fearPeakOut"]),
            "悲観が強い一方、底打ち確認が不足しています。",
        )
        append_reason(
            add_reasons,
            at_least(rate_bear, add_cautious["rateBear"]) and below(peak_out, add_cautious["ratePeakOut"]),
            "金利圧力に対して回復確認が弱い状態です。",
        )
        append_reason(
            add_reasons,
            (vix_sp_decline or vix_nasdaq_decline) and not vix_decline_confirmed,
            "VIXと一部指数は悪化していますが、市場全体の確認が不足しているため追加は小さくします。",
        )
        append_reason(
            add_reasons,
            credit_trend_worsening and not credit_trend_confirmed,
            "信用選好は悪化していますが、市場全体の裏付けが弱いため追加は小さくします。",
        )
        append_reason(add_reasons, at_least(heat, add_cautious["heat"]), "過熱度が高く、追加ペースを抑える局面です。")
        append_reason(add_reasons, at_least(stress, add_cautious["stress"]), "ストレス度が高く、追加は小さく限定すべき局面です。")
        append_reason(
            add_reasons,
            regime_key == "constructive" and at_least(fear_greed, 65) and at_least(qqq_spy_20d, 2),
            "回復局面でも短期の楽観とNasdaq優位が進み、追いかけ買いは小さくします。",
        )
        append_reason(
            add_reasons,
            regime_key == "constructive" and at_least(rate_bear, 38) and below(qqq_spy_20d, 1.5),
            "回復局面でも金利圧力が残り、Nasdaq優位も弱いため追加は小さくします。",
        )
        append_reason(
            add_reasons,
            regime_key == "risk_on" and at_least(peak_out, 60) and below(nasdaq_change_5d, 0),
            "リスクオンでもNasdaq100の短期失速があり、追加は小さくします。",
        )
        if add_reasons:
            add_permission = "cautious"
    if add_permission == "normal":
        add_reasons.append("通常ペース可。ただし既存ルールと対象ETFのトレンド確認を優先します。")

    basic_safety = (
        below(credit_stress, trim_avoid["creditStress"])
        and regime_key != "credit_crisis"
        and not (
            at_least(rate_bear, trim_defensive["rateBear"])
            and below(peak_out, trim_defensive["rateBearPeakOut"])
        )
    )
    fear_or_panic = (
        at_most(fear_greed, trim_avoid["fearGreed"])
        or at_least(panic, trim_avoid["panic"])
        or at_least(vix, trim_avoid["vix"])
        or at_most(sp500_change_10d, trim_avoid["sp500Change10d"])
        or at_most(nasdaq_change_10d, trim_avoid["nasdaq100Change10d"])
    )
    reversal_evidence = (
        at_least(peak_out, trim_avoid["peakOut"])
        or at_most(vix_drawdown, trim_avoid["vixDrawdown"])
        or derived.get("sp500NoNewLow3d") is True
        or derived.get("nasdaq100NoNewLow3d") is True
        or at_least(credit_5d, trim_avoid["creditTrend5d"])
    )
    recovery_context = (
        fear_or_panic
        or (at_least(peak_out, 65) and at_most(vix_drawdown, -20))
    )
    credit_still_worsening = (
        at_most(credit_5d, add_blocked["creditTrend5d"])
        or at_most(credit_10d, add_blocked["creditTrend10d"])
    )
    strong_short_bounce = (
        at_least(peak_out, 65)
        and at_most(vix_drawdown, -15)
        and (
            derived.get("sp500NoNewLow3d") is True
            or derived.get("nasdaq100NoNewLow3d") is True
        )
    )
    credit_crisis_vix_relief = (
        regime_key == "credit_crisis"
        and at_least(peak_out, 35)
        and at_most(vix_drawdown, -10)
        and (
            derived.get("sp500NoNewLow3d") is True
            or derived.get("nasdaq100NoNewLow3d") is True
            or at_least(credit_5d, -2)
        )
    )
    credit_crisis_reversal = (
        credit_crisis_vix_relief
        or (
            regime_key == "credit_crisis"
            and at_least(peak_out, 45)
            and at_most(vix_drawdown, -12)
            and at_least(credit_5d, -1.5)
            and (
                derived.get("sp500NoNewLow3d") is True
                or derived.get("nasdaq100NoNewLow3d") is True
                or (
                    above(sp500_change_5d, 0)
                    and above(nasdaq_change_5d, 0)
                    and below(vix_change_5d, 0)
                )
            )
        )
    )
    hold_defense = (
        (
            regime_key == "selective_defense"
            and basic_safety
            and (
                (recovery_context and reversal_evidence and not credit_still_worsening)
                or strong_short_bounce
            )
        )
        or credit_crisis_reversal
    )
    defensive_priority = (
        regime_key == "selective_defense"
        or regime_key == "credit_crisis"
        or (at_least(credit_stress, trim_defensive["creditStress"]) and below(peak_out, trim_defensive["creditPeakOut"]))
        or (at_least(rate_bear, trim_defensive["rateBear"]) and below(peak_out, trim_defensive["ratePeakOut"]))
    )

    if hold_defense:
        trim_reasons.append("防御状態は維持しつつ、反転確認があるため追加の大幅縮小を止めます。")
    elif regime_key == "selective_defense":
        trim_reasons.append("選択型防御が成立しているため、防御余力を確保します。")
    if regime_key == "credit_crisis":
        trim_reasons.append("信用危機判定を優先し、防御余力を確保します。")
    if at_least(credit_stress, trim_defensive["creditStress"]) and below(peak_out, trim_defensive["creditPeakOut"]):
        trim_reasons.append("信用ストレスが強く、底打ち確認も不足しています。")
    if at_least(rate_bear, trim_defensive["rateBear"]) and below(peak_out, trim_defensive["ratePeakOut"]):
        trim_reasons.append("強い金利主導ベアで、回復確認が不足しています。")
    if at_most(credit_5d, trim_defensive["creditTrend5d"]) or at_most(credit_10d, trim_defensive["creditTrend10d"]):
        trim_reasons.append("信用選好の急悪化を確認しています。")

    trim_permission = "hold_defense" if hold_defense else "defensive_priority" if defensive_priority else "allowed"
    if not defensive_priority:
        basic_safety = (
            below(credit_stress, trim_avoid["creditStress"])
            and regime_key != "credit_crisis"
            and not (
                at_least(rate_bear, trim_defensive["rateBear"])
                and below(peak_out, trim_defensive["ratePeakOut"])
            )
        )
        fear_or_panic = (
            at_most(fear_greed, trim_avoid["fearGreed"])
            or at_least(panic, trim_avoid["panic"])
            or at_least(vix, trim_avoid["vix"])
            or at_most(sp500_change_10d, trim_avoid["sp500Change10d"])
            or at_most(nasdaq_change_10d, trim_avoid["nasdaq100Change10d"])
        )
        reversal_evidence = (
            at_least(peak_out, trim_avoid["peakOut"])
            or at_most(vix_drawdown, trim_avoid["vixDrawdown"])
            or derived.get("sp500NoNewLow3d") is True
            or derived.get("nasdaq100NoNewLow3d") is True
            or at_least(credit_5d, trim_avoid["creditTrend5d"])
        )

        if basic_safety and fear_or_panic:
            trim_permission = "avoid"
            trim_reasons.append(
                "恐怖局面ですが、信用危機ではなく反転確認もあるため、大幅な投げ売りを避けます。"
                if reversal_evidence
                else "恐怖水準が高く、信用市場が崩壊していないため、ここからの大幅縮小を避けます。"
            )
        else:
            append_reason(trim_reasons, at_most(fear_greed, trim_cautious["fearGreed"]), "悲観が強く、縮小は小さく分ける局面です。")
            append_reason(trim_reasons, at_least(panic, trim_cautious["panic"]), "パニック度が高く、安値での売りすぎに注意が必要です。")
            append_reason(
                trim_reasons,
                at_least(stress, trim_cautious["stress"]) and below(credit_stress, trim_cautious["creditStress"]),
                "市場ストレスは高いものの、信用危機水準には達していません。",
            )
            append_reason(
                trim_reasons,
                at_most(sp500_change_5d, trim_cautious["sp500Change5d"]),
                "S&P500の短期下落が大きく、縮小は慎重に行う局面です。",
            )
            append_reason(
                trim_reasons,
                at_most(nasdaq_change_5d, trim_cautious["nasdaq100Change5d"]),
                "Nasdaq100の短期下落が大きく、縮小は慎重に行う局面です。",
            )
            if trim_reasons:
                trim_permission = "cautious"

    confidence = guardrail_confidence(values, derived, scores)
    if confidence != "high":
        warnings.append("一部データ不足のため、guardrails 判定の信頼度を下げています。")

    if confidence == "low" and trim_permission not in ("defensive_priority", "hold_defense"):
        if add_permission != "blocked":
            add_permission = "cautious"
        if trim_permission != "avoid":
            trim_permission = "cautious"
        add_reasons.insert(0, "主要データが不足しているため、積極的な変更判断を保留します。")

    main_label = guardrail_main_label(add_permission, trim_permission)
    if confidence == "low" and trim_permission not in ("defensive_priority", "hold_defense") and add_permission != "blocked":
        main_label = "判断不能・維持"

    reasons = list(dict.fromkeys(add_reasons + trim_reasons))[:6]
    if not reasons:
        reasons.append("強い禁止条件は確認されていません。")

    return {
        "addPermission": add_permission,
        "trimPermission": trim_permission,
        "mainLabel": main_label,
        "confidence": confidence,
        "reasons": reasons,
        "warnings": warnings,
    }


def guardrail_confidence(values: dict, derived: dict, scores: dict) -> str:
    critical_missing = sum(1 for key in GUARDRAIL_CRITICAL_VALUE_IDS if number_from(values, key) is None)
    market_core_missing = (
        number_from(values, "vix") is None
        or number_from(values, "creditTrend") is None
        or (
            number_from(values, "spDeviation") is None
            and number_from(values, "nasdaqDeviation") is None
        )
    )
    derived_missing = sum(1 for key in GUARDRAIL_DERIVED_IDS if derived.get(key) is None)
    score_missing = sum(
        1
        for key in ("panicScore", "peakOutScore", "preCrashRiskScore", "rateBearScore", "creditStressScore")
        if number_from(scores, key) is None
    )
    if market_core_missing or critical_missing >= 2:
        return "low"
    if critical_missing == 0 and derived_missing <= 2 and score_missing == 0:
        return "high"
    return "medium"


def guardrail_main_label(add_permission: str, trim_permission: str) -> str:
    if trim_permission == "hold_defense":
        return "防御維持・追加縮小なし"
    if trim_permission == "defensive_priority":
        return "防御優先"
    if add_permission == "blocked" and trim_permission == "avoid":
        return "両面禁止・維持"
    if add_permission == "blocked":
        return "買い増し禁止"
    if trim_permission == "avoid":
        return "売りすぎ注意"
    if add_permission == "cautious" and trim_permission == "cautious":
        return "慎重維持"
    if add_permission == "cautious":
        return "小さく打診まで"
    return "通常維持"


def append_reason(reasons: list[str], condition: bool, text: str) -> None:
    if condition:
        reasons.append(text)


def at_least(value: float | None, threshold: float) -> bool:
    return value is not None and value >= threshold


def at_most(value: float | None, threshold: float) -> bool:
    return value is not None and value <= threshold


def above(value: float | None, threshold: float) -> bool:
    return value is not None and value > threshold


def below(value: float | None, threshold: float) -> bool:
    return value is not None and value < threshold


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
    sp500_change_5d = number_from(derived, "sp500Change5d")
    nasdaq_change_5d = number_from(derived, "nasdaq100Change5d")
    recovery_expansion_confirmed = (
        at_least(peak_out, 65)
        and below(vix_change_5d, 0)
        and at_least(credit_5d, 0)
        and above(sp500_change_5d, 0)
        and above(nasdaq_change_5d, 0)
    )
    constructive_expansion_confirmed = (
        at_least(peak_out, 55)
        and above(sp500_change_5d, 0)
        and above(nasdaq_change_5d, 0)
    )
    sp_no_low = derived.get("sp500NoNewLow3d") is True
    nasdaq_no_low = derived.get("nasdaq100NoNewLow3d") is True
    selective_active = derived.get("selectiveDefenseActive")
    selective_risk = derived.get("selectiveDefenseRisk")
    selective_ready = isinstance(selective_active, bool) and isinstance(selective_risk, bool)
    selective_days = number_from(derived, "selectiveDefenseRiskDays")
    selective_reasons = selective_defense_reasons(derived)

    if core_count < 6:
        return regime_payload(
            "data_quality_hold",
            "データ品質確認",
            "維持",
            "主要データ不足のため新規判断は保留",
            ["主要自動指標が6件未満です。"],
            warnings,
        )

    if selective_active is True:
        return regime_payload(
            "selective_defense",
            "選択型防御",
            "縮小",
            "危機条件の解除確認まで防御を維持",
            selective_reasons or ["価格・VIX・信用・市場の広がりの悪化が確認されています。"],
            warnings,
        )

    if at_least(credit_stress, 68) and at_least(panic, 50) and below(peak_out, 58):
        return regime_payload(
            "credit_crisis",
            "信用危機継続",
            "縮小",
            "現金余力優先。反発狙いは極小に限定",
            ["HYG/IEFの悪化が強く、恐怖が底打ち確認を上回っています。"],
            warnings,
        )

    if selective_risk is True:
        selective_days_label = "不明" if selective_days is None else str(round(selective_days))
        return regime_payload(
            "selective_risk_watch",
            "危機予兆を確認中",
            "維持",
            f"縮小条件は{selective_days_label}/4日。4日継続までは警戒表示のみ",
            selective_reasons,
            warnings,
        )

    if at_least(rate_bear, 64) and at_least(credit_stress, 35) and below(peak_out, 62):
        return regime_payload(
            "rate_bear",
            "金利主導ベア",
            "維持",
            "金利低下またはグロース回復確認まで拡大を急がない",
            ["金利・実質金利の圧力が、株式の短期回復を抑えています。"],
            warnings,
        )

    if at_least(pre_crash, 64):
        return regime_payload(
            "pre_crash_risk",
            "過熱・内部劣化",
            "維持",
            "危機条件が4日継続するまでは警戒表示に限定",
            ["上方乖離が大きい一方で、VIXまたは信用選好に悪化の兆しがあります。"],
            warnings,
        )

    if at_least(panic, 64) and at_least(peak_out, 64) and below(credit_stress, 60) and (sp_no_low or nasdaq_no_low) and (credit_5d is None or credit_5d >= -0.5) and (vix_change_5d is None or vix_change_5d < 0):
        return regime_payload(
            "buyable_fear",
            "買える恐怖",
            "維持",
            "逆張り候補として監視。追加はVIX低下、信用改善、指数回復の継続待ち",
            ["恐怖は強いものの、VIX低下・安値更新停止・信用選好の下げ止まりがそろっています。"],
            warnings,
        )

    if at_least(panic, 45) and at_least(peak_out, 55) and below(credit_stress, 68):
        return regime_payload(
            "recovering_stress",
            "悲観だが回復中",
            "やや拡大" if recovery_expansion_confirmed else "維持",
            "価格・VIX・信用の確認後に小さく分割"
            if recovery_expansion_confirmed
            else "価格・VIX・信用の確認がそろうまで維持",
            ["悲観は残りますが、回復確認の指標が優勢です。"],
            warnings,
        )

    if at_least(rate_bear, 45) and below(peak_out, 45):
        return regime_payload(
            "caution",
            "警戒・様子見",
            "維持",
            "金利圧力と回復確認の弱さが残るため、無理に増やさない",
            ["金利系の圧力が残り、VIXピークアウトや短期回復の確認が弱いです。"],
            warnings,
        )

    return fallback_three_axis_regime(
        values,
        warnings,
        selective_ready,
        recovery_expansion_confirmed,
        constructive_expansion_confirmed,
    )


def fallback_three_axis_regime(
    values: dict,
    warnings: list[str],
    selective_ready: bool = False,
    recovery_expansion_confirmed: bool = False,
    constructive_expansion_confirmed: bool = False,
) -> dict:
    axes = calculate_three_axis_scores(values)
    heat = axes["heat"]
    stress = axes["stress"]
    recovery = axes["recovery"]

    if stress >= 72 and recovery < 45:
        judgment = "維持" if selective_ready else "縮小"
        return regime_payload("crisis", "危機警戒", judgment, "急いで増やさず、防御条件の確認を優先", ["3軸判定でストレスが高く、回復確認が弱いです。"], warnings)
    if stress >= 58 and recovery >= 58:
        judgment = "やや拡大" if recovery_expansion_confirmed else "維持"
        hint = "価格・VIX・信用の確認後に小さく分割" if recovery_expansion_confirmed else "価格・VIX・信用の確認がそろうまで維持"
        return regime_payload("recovering_stress", "悲観だが回復中", judgment, hint, ["3軸判定でストレスは残る一方、回復確認が出ています。"], warnings)
    if heat >= 72 and stress >= 50:
        judgment = "維持" if selective_ready else "やや縮小"
        return regime_payload("overheat_fading", "過熱から失速", judgment, "選択型防御条件が成立するまでは警戒表示", ["3軸判定で過熱とストレス上昇が重なっています。"], warnings)
    if heat >= 72:
        return regime_payload("overheat", "過熱リスクオン", "維持", "新規追加は慎重に小さく", ["3軸判定で過熱寄りです。"], warnings)
    if heat < 45 and stress < 55 and recovery >= 55:
        judgment = "やや拡大" if constructive_expansion_confirmed else "維持"
        hint = "短期の回復候補。通常より小さく分割" if constructive_expansion_confirmed else "指数の短期上昇と底打ち確認がそろうまで維持"
        return regime_payload("constructive", "健全な回復", judgment, hint, ["3軸判定で過熱が低く、回復度が優勢です。"], warnings)
    if stress < 45 and 45 <= heat < 70:
        return regime_payload("risk_on", "通常のリスクオン", "維持", "追いかけすぎに注意しながら維持", ["3軸判定で市場環境は比較的安定しています。"], warnings)
    if stress >= 48 and recovery < 50:
        return regime_payload("caution", "警戒・様子見", "維持", "悪化が止まるまで無理に増やさない", ["3軸判定でストレスが残り、回復確認が弱いです。"], warnings)

    return regime_payload("neutral", "中立・維持", "維持", "強い方向感は限定的", ["3軸判定では強い方向感が限定的です。"], warnings)


def selective_defense_reasons(derived: dict) -> list[str]:
    labels = [
        ("selectivePriceRisk", "S&P500の短期価格トレンドが悪化"),
        ("selectiveVolatilityRisk", "VIXまたはVIX期間構造が悪化"),
        ("selectiveCreditRisk", "HYG/IEFで信用選好が悪化"),
        ("selectiveBreadthRisk", "RSP/SPYで市場の広がりが悪化"),
    ]
    return [label for key, label in labels if derived.get(key) is True]


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


def score_value(scores: dict, key: str) -> float | None:
    return number_from(scores, key)


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
    for key in ("derived", "scores", "regime", "guardrails"):
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
