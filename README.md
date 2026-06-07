# 市場温度計ダッシュボード

Yahoo Finance、米財務省、Stooq、CNNの公開データをGitHub Actionsで取得し、GitHub Pagesで表示する静的な市場温度計です。

このツールは投資判断の補助であり、将来のリターンを保証するものではありません。スコアや信号は入力値と簡易ロジックに基づく概算です。

## 画面の見方

現行版は、単純な総合点ではなく、ポートフォリオ調整に使いやすい3軸と5段階のポジション判断で局面を判定します。

- `過熱度`: 買われすぎ、リスクオン過多、追いかけ注意を測る軸
- `ストレス度`: 市場が壊れやすいか、急いで増やしてよいかを測る軸
- `回復度`: 悲観が底打ちし、分割拡大候補になり始めたかを測る軸

主な局面表示:

- `悲観だが回復中`: ストレスは残るが改善の兆し。小さく分割で拡大候補。
- `危機警戒`: 悲観は強いが、まだ急いで増やす局面ではない。
- `健全な回復`: 過熱が強くなく、回復モメンタムが優勢。
- `過熱リスクオン`: リスク選好が進み、新規追加は慎重に見る局面。
- `過熱から失速`: 買われすぎにストレス上昇が重なり、一部縮小や防御を検討する局面。
- `中立・維持`: 強い方向感は限定的。

ポジション判断は `拡大`、`やや拡大`、`維持`、`やや縮小`、`縮小` の5段階です。過熱度は単純な売り信号ではなく、ストレス度と回復度を合わせて新規追加ペースを調整するために使います。

## ファイル構成

- `index.html`: 画面本体
- `assets/style.css`: ダークテーマのスタイル
- `src/scoring.js`: 市場温度スコア、補正、モメンタム判定
- `src/data-loader.js`: `data/latest.json` 読み込み、手動上書き、履歴管理
- `src/app.js`: 画面描画とイベント処理
- `scripts/fetch_market_data.py`: 公開市場データを取得してJSONを生成
- `data/latest.json`: GitHub Pagesが読み込む最新データ
- `data/history.json`: GitHub Actionsで保存する最新30件の履歴
- `.github/workflows/update-market-data.yml`: 定期更新ワークフロー
- `requirements.txt`: Python依存関係

## 自動取得する指標

APIキーなしで取得できる公開データを使います。

- `CNN Fear & Greed`: Fear & Greed Index
- `Yahoo ^VIX`: VIX
- `Yahoo ^GSPC`: S&P500終値
- `Yahoo ^NDX`: NASDAQ100終値
- `U.S. Treasury Daily Treasury Par Yield Curve Rates`: 米10年金利、10年-2年金利差
- `U.S. Treasury Daily Treasury Par Real Yield Curve Rates`: 米10年実質金利
- `Stooq USDJPY`: ドル円
- `Frankfurter USDJPY`: ドル円のフォールバック
- `Yahoo HYG / IEF`: 信用選好の代理指標
- `Yahoo CL=F`: WTI原油先物

計算で作る値:

- `spDeviation`: S&P500最新値と200日移動平均の乖離率
- `nasdaqDeviation`: NASDAQ100最新値と200日移動平均の乖離率
- `us10yChange`: 米10年金利の約1か月前との差、単位bp
- `vixChange`: VIXの約1か月前との差
- `fearGreedChange`: Fear & Greedの約1か月前との差
- `oilDeviation`: WTI原油価格の200日移動平均からの乖離率
- `creditTrend`: HYG/IEF比率の200日移動平均からの乖離率

## 初版で自動取得しない項目

以下は安定取得が難しいため、手動任意項目として扱います。

- S&P500 200日線上銘柄比率
- Put/Call Ratio
- NAAIM Exposure Index
- AAII Bull-Bear Spread
- 金価格200日線乖離

Fear & Greed IndexはCNNの画面で使われているJSONエンドポイントからGitHub Actions側で取得します。公式に安定保証されたAPIではないため、取得失敗時は前回JSONを保持し、画面に警告を表示します。

ドル円は通常はStooqのUSDJPY quoteを使います。Stooq取得に失敗した場合はFrankfurterの日次レートにフォールバックします。

FREDの `BAA10Y` と `STLFSI4` は取得が不安定だったため、必須指標から外しています。信用市場のストレスは、より取得しやすい `HYG/IEF` 比率の200日線乖離で近似します。

## GitHub Pagesで使う

1. このリポジトリをGitHubにpushします。
2. GitHub Pagesを有効化します。
3. Actionsタブで `Update market data` を手動実行します。
4. `data/latest.json` が更新されたら、Pages上の `index.html` がそのJSONを読み込みます。

## 自動更新

`.github/workflows/update-market-data.yml` は以下に対応しています。

- `workflow_dispatch`: 手動実行
- `schedule`: 火〜土 JST 09:30 に実行し、米国市場の月〜金終値を取得
- 変更がある場合だけ `Update market data` で `data/latest.json` と `data/history.json` をコミット

取得失敗時は前回のJSON値を保持し、`status: "error"` と `warnings` を更新します。画面側では「取得失敗」「データが古い」などを表示します。

## ローカル更新

```bash
python scripts/fetch_market_data.py
```

ローカルで `index.html` を直接開く場合、ブラウザによっては `fetch("data/latest.json")` が制限されます。その場合は簡易サーバーで確認してください。

```bash
python -m http.server 8000
```

## 手動上書きと履歴

画面の「手動上書き・任意メモ」から、自動取得値を一時的に上書きできます。空欄の場合は自動取得値を使います。

通常の前回比は、GitHub Actionsが更新する `data/history.json` を使います。保存されるのは最新30件で、各指標カードのミニチャートにも使います。

履歴保存ボタンは、手動上書きやメモを使った場合のローカル控えです。ブラウザのlocalStorageに保存されますが、通常運用ではGitHub側の `data/history.json` が優先されます。
