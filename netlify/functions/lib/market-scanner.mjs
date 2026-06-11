const API_ENDPOINTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
];
const EXCLUDED = /^(USDC|FDUSD|TUSD|USDP|DAI|EUR|TRY|BUSD|AEUR|XUSD|USD1|BFUSD|RLUSD|USDE|EURI|USTC)USDT$|(?:UP|DOWN|BULL|BEAR)USDT$/;

async function getJson(resource) {
  let lastError;
  for (const endpoint of API_ENDPOINTS) {
    try {
      const response = await fetch(endpoint + resource, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Binance API error: ${lastError?.message}`);
}

function supertrend(candles, period = 10, multiplier = 3) {
  const tr = [], atr = [], upper = [], lower = [], direction = [], line = [];
  for (let i = 0; i < candles.length; i += 1) {
    const { high, low, close } = candles[i];
    const previousClose = candles[i - 1]?.close;
    tr[i] = previousClose === undefined
      ? high - low
      : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
    if (i === period - 1) {
      atr[i] = tr.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    } else if (i >= period) {
      atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
    } else {
      continue;
    }
    const midpoint = (high + low) / 2;
    const basicUpper = midpoint + multiplier * atr[i];
    const basicLower = midpoint - multiplier * atr[i];
    upper[i] = i === period - 1 || basicUpper < upper[i - 1] || previousClose > upper[i - 1]
      ? basicUpper : upper[i - 1];
    lower[i] = i === period - 1 || basicLower > lower[i - 1] || previousClose < lower[i - 1]
      ? basicLower : lower[i - 1];
    if (i === period - 1) direction[i] = close >= midpoint ? 1 : -1;
    else if (direction[i - 1] === -1 && close > upper[i]) direction[i] = 1;
    else if (direction[i - 1] === 1 && close < lower[i]) direction[i] = -1;
    else direction[i] = direction[i - 1];
    line[i] = direction[i] === 1 ? lower[i] : upper[i];
  }
  const last = candles.length - 1;
  return {
    direction: direction[last],
    flip: direction[last] !== direction[last - 1],
    line: line[last],
    distancePercent: ((candles[last].close - line[last]) / line[last]) * 100,
    candleCloseTime: candles[last].closeTime,
  };
}

async function getSignal(symbol, interval) {
  const raw = await getJson(`/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=150`);
  const candles = raw
    .filter((item) => item[6] < Date.now())
    .map((item) => ({
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      closeTime: Number(item[6]),
    }));
  if (candles.length < 12) return null;
  return supertrend(candles);
}

async function getMarkets() {
  const [tickers, exchangeInfo] = await Promise.all([
    getJson("/api/v3/ticker/24hr"),
    getJson("/api/v3/exchangeInfo"),
  ]);
  const active = new Set(exchangeInfo.symbols
    .filter((symbol) => symbol.status === "TRADING"
      && symbol.quoteAsset === "USDT"
      && symbol.isSpotTradingAllowed)
    .map((symbol) => symbol.symbol));
  return tickers
    .filter((ticker) => active.has(ticker.symbol)
      && !EXCLUDED.test(ticker.symbol)
      && Number(ticker.quoteVolume) > 0)
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume));
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runWorker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

export async function scanIntervals(intervals) {
  const markets = await getMarkets();
  const jobs = markets.flatMap((ticker) =>
    intervals.map((interval) => ({ ticker, interval })));
  const scanned = await mapWithConcurrency(jobs, 40, async ({ ticker, interval }) => ({
    ticker,
    interval,
    signal: await getSignal(ticker.symbol, interval),
  }));
  const result = {
    marketCount: markets.length,
    markets: markets.map((ticker) => ticker.symbol),
    marketPrices: Object.fromEntries(markets.map((ticker) => [
      ticker.symbol,
      Number(ticker.lastPrice),
    ])),
    intervals: {},
    states: {},
  };
  for (const interval of intervals) {
    result.states[interval] = scanned
      .filter((item) => item.interval === interval && item.signal)
      .map(({ ticker, signal }) => ({
        symbol: ticker.symbol,
        direction: signal.direction === 1 ? "AL" : "SAT",
        isNew: signal.flip,
        price: Number(ticker.lastPrice),
        supertrend: signal.line,
        distancePercent: signal.distancePercent,
        quoteVolume: Number(ticker.quoteVolume),
        candleCloseTime: new Date(signal.candleCloseTime).toISOString(),
      }));
    result.intervals[interval] = scanned
      .filter((item) => item.interval === interval && item.signal?.flip)
      .map(({ ticker, signal }) => ({
        symbol: ticker.symbol,
        signal: signal.direction === 1 ? "YENI AL" : "YENI SAT",
        price: Number(ticker.lastPrice),
        supertrend: signal.line,
        distancePercent: signal.distancePercent,
        quoteVolume: Number(ticker.quoteVolume),
        candleCloseTime: new Date(signal.candleCloseTime).toISOString(),
      }))
      .sort((a, b) => b.quoteVolume - a.quoteVolume);
  }
  return result;
}
