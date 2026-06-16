from scripts.fetch_market_data import (
    build_guardrails,
    calculate_three_axis_scores,
    score_value,
)


VALUES = {
    "vix": 30,
    "fearGreed": 18,
    "spDeviation": -6,
    "nasdaqDeviation": -8,
    "creditTrend": 1,
    "us10y": 4.2,
    "realYield": 1.8,
}
DERIVED = {
    "vixChange5d": -5,
    "vixDrawdownFrom10dHigh": -12,
    "sp500Change5d": 2,
    "sp500Change10d": -7,
    "nasdaq100Change5d": 3,
    "nasdaq100Change10d": -9,
    "creditTrend5d": 0.2,
    "creditTrend10d": -0.2,
    "qqqSpyChange20d": 0.5,
    "sp500NoNewLow3d": True,
    "nasdaq100NoNewLow3d": True,
}
SCORES = {
    "panicScore": 70,
    "peakOutScore": 65,
    "preCrashRiskScore": 25,
    "rateBearScore": 30,
    "creditStressScore": 40,
}


hold = build_guardrails(
    {"heat": 30, "stress": 65, "recovery": 65},
    VALUES,
    DERIVED,
    SCORES,
    {"key": "selective_defense"},
)
assert hold["addPermission"] == "blocked"
assert hold["trimPermission"] == "hold_defense"
assert hold["mainLabel"] == "防御維持・追加縮小なし"

missing_credit = build_guardrails(
    {"heat": 30, "stress": 35, "recovery": 50},
    {**VALUES, "creditTrend": None},
    DERIVED,
    SCORES,
    {"key": "risk_on"},
)
assert missing_credit["confidence"] == "low"
assert missing_credit["mainLabel"] == "判断不能・維持"

missing_axes = calculate_three_axis_scores({})
assert missing_axes == {"heat": None, "stress": None, "recovery": None}
assert score_value({}, "panicScore") is None

print("python guardrail scenarios passed")
