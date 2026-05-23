/**
 * Plain-English descriptions for every metric the model uses.
 * Used in <InfoTip /> tooltips throughout the UI.
 */

export const CATEGORY_INFO: Record<string, { what: string; why: string }> = {
  momentum: {
    what: 'Tracks how the sector\'s price is behaving — distance from moving averages, rate of change over 1/3/6 months, RSI, and relative strength versus the broader market.',
    why:  'Price trends can persist (or, in shorter windows, reverse). The data-driven model has actually learned that strong recent momentum tends to mean-revert over 3-12 month horizons.',
  },
  macro: {
    what: 'Captures the interest-rate and credit environment: Treasury yield curve, real yields, high-yield and investment-grade credit spreads, the US Dollar Index, and sector-specific commodities.',
    why:  'Fed policy, recession risk, and currency moves drive sector performance broadly. Tight credit spreads and a strong dollar are headwinds; widening spreads often mark capitulation lows.',
  },
  sentiment: {
    what: 'Reads market mood through the VIX (expected volatility), VIX term structure (near-term vs 3-month VIX), and the CNN Fear & Greed Index.',
    why:  'Extreme sentiment often precedes reversals. High fear marks bottoms; complacency marks tops. The backtest confirmed this — high VIX has historically preceded gains.',
  },
  regime: {
    what: 'Cross-sector context: cyclical (XLY) vs defensive (XLP) leadership and how tightly this sector moves with the broader market.',
    why:  'When investors prefer growth over safety, cyclicals lead. Tracks whether we\'re in risk-on or risk-off mode and where this sector sits relative to the market.',
  },
}

export const FEATURE_INFO: Record<string, { what: string; why: string }> = {
  price_vs_50dma: {
    what: 'How far above or below the 50-day moving average the sector is trading.',
    why:  'A medium-term trend gauge — a popular benchmark used by trend-followers and discretionary traders alike.',
  },
  price_vs_200dma: {
    what: 'How far above or below the 200-day moving average the sector is trading.',
    why:  'The classic long-term trend signal. Above 200dma = bull market; below = bear. One of the most-watched levels on Wall Street.',
  },
  roc_1m: {
    what: 'The percent change in the sector\'s price over the past month.',
    why:  'Captures short-term price acceleration or deceleration.',
  },
  roc_3m: {
    what: 'The percent change in the sector\'s price over the past 3 months.',
    why:  'A medium-term momentum window often used in academic momentum strategies.',
  },
  roc_6m: {
    what: 'The percent change in the sector\'s price over the past 6 months.',
    why:  'A longer-term momentum window — useful for identifying durable trends versus short-term noise.',
  },
  relative_strength_3m: {
    what: 'How the sector has performed versus the S&P 500 (SPY) over the past 3 months.',
    why:  'Identifies sector leaders and laggards. Strong relative strength has historically reversed at this horizon.',
  },
  rsi: {
    what: 'The Relative Strength Index — a 0-100 momentum oscillator measuring recent gains versus recent losses.',
    why:  'Above 70 is considered "overbought," below 30 "oversold." A widely-watched mean-reversion signal.',
  },
  dist_52w_high: {
    what: 'How far the sector is currently trading below its highest price in the past 52 weeks (always ≤ 0%).',
    why:  'A pure sector-level mean-reversion gauge. Sectors that have sold off well below their 1-year high have historically tended to recover faster than ones still pinned near new highs.',
  },
  yield_curve_slope: {
    what: 'The 10-year Treasury yield minus the 2-year Treasury yield.',
    why:  'A steepening curve signals rising growth expectations; an inverted curve (negative slope) has preceded most US recessions.',
  },
  yield_curve_chg_1m: {
    what: 'The 1-month change in the yield curve slope.',
    why:  'Captures the direction of the curve\'s movement — steepening or flattening — which often signals shifting Fed expectations.',
  },
  real_yield_level: {
    what: 'The 10-year Treasury Inflation-Protected Security (TIPS) yield, i.e., the real (inflation-adjusted) interest rate.',
    why:  'Rising real yields tighten financial conditions and pressure long-duration assets like Tech. Falling real yields are usually equity-supportive.',
  },
  hy_spread_level: {
    what: 'The yield premium investors demand to hold high-yield (junk) bonds over Treasuries.',
    why:  'Wide spreads = market stress and fear; tight spreads = complacency. One of the cleanest real-time gauges of risk appetite.',
  },
  hy_spread_chg_1m: {
    what: 'The 1-month change in the high-yield credit spread.',
    why:  'Direction matters: spreads widening fast often marks the beginning of risk-off; tightening signals returning confidence.',
  },
  ig_spread_level: {
    what: 'The yield premium investors demand to hold investment-grade corporate bonds over Treasuries.',
    why:  'Less volatile than high-yield spreads — a good cross-check for the credit cycle without the noise.',
  },
  usd_change_3m: {
    what: 'The 3-month percent change in the US Dollar Index (broad trade-weighted).',
    why:  'A strong dollar squeezes multinational earnings (Tech, Energy, Materials) and pressures commodities. A weak dollar generally helps risk assets.',
  },
  commodity_change_3m: {
    what: 'The 3-month percent change in the sector\'s reference commodity (e.g., oil for Energy, copper for Materials/Industrials).',
    why:  'Commodity prices flow directly into sector earnings — oil moves with Energy, copper with Industrials and Materials.',
  },
  bond_equity_ratio_chg_3m: {
    what: 'The 3-month percent change in the ratio of long-dated Treasuries (TLT) to the S&P 500 (SPY).',
    why:  'A clean cross-asset risk-on / risk-off gauge: when TLT outperforms SPY, money is fleeing stocks for safety. Historically a falling TLT/SPY ratio has preceded sector rallies.',
  },
  vix_level: {
    what: 'The CBOE Volatility Index — the market\'s expected 30-day volatility, a.k.a. the "fear gauge".',
    why:  'Low VIX = calm, often complacent. Spikes mark fear and panic. Historically high VIX readings have preceded equity rallies.',
  },
  vix_term_structure: {
    what: 'The ratio of front-month VIX to 3-month VIX (VIX/VIX3M).',
    why:  'Below 1 (contango) = market expects calm; above 1 (backwardation) = near-term fear higher than medium-term — a classic stress signal.',
  },
  fear_greed: {
    what: 'CNN\'s composite Fear & Greed Index (0 = extreme fear, 100 = extreme greed).',
    why:  'Aggregates seven sentiment indicators into one number. Extreme readings on either side often mark turning points.',
  },
  vix_pctile_1y: {
    what: 'Where the current VIX sits within its trailing 1-year range, on a 0-to-100 percentile scale.',
    why:  'Less affected by extreme tail events than a raw z-score. A VIX in the 90th+ percentile of its 1y range has historically been a strong mean-reversion-bullish setup.',
  },
  cyclical_vs_defensive: {
    what: 'The 3-month change in the ratio of XLY (consumer discretionary) to XLP (consumer staples).',
    why:  'A rising ratio means investors prefer growth over safety — risk-on. The model has learned that recent rotation tends to reverse over 3 months.',
  },
  sector_vs_market_corr: {
    what: 'The 60-day rolling correlation between the sector\'s daily returns and the S&P 500.',
    why:  'High correlation means the sector moves with the market and offers little diversification. Drops in correlation often signal rotation or stress.',
  },
  breadth_above_50dma: {
    what: 'The percentage of the 11 SPDR sector ETFs currently trading above their own 50-day moving average.',
    why:  'A market-wide regime gauge. When breadth is broad (8+ of 11 sectors above 50-DMA), bull-market dynamics are healthy. When breadth is thin (only a few sectors above), rallies are usually fragile.',
  },
}

export const COMPOSITE_INFO = {
  what: 'A single number from -100 (very bearish) to +100 (very bullish) combining 23 features into one score. Weights and signs are learned from history; features whose predictive sign flips between regimes are dropped entirely.',
  why:  'A composite reduces noise — no single signal is perfect, but combining many gives a more robust read on direction. Trained on weekly observations going back to 2019, blending 1-month and 3-month forward-return correlations.',
}

export const COVERAGE_INFO = {
  what: 'The percentage of input features that had usable data when this score was computed.',
  why:  'The model degrades gracefully when sources fail. 95-100% coverage means nearly everything was available; lower means some signals were missing.',
}

export const HORIZON_INFO = {
  fwd_return_1m: 'How the sector\'s price actually moved over the 21 trading days (≈1 calendar month) after the score was computed.',
  fwd_return_3m: 'How the sector\'s price actually moved over the 63 trading days (≈3 calendar months) after the score was computed.',
  fwd_return_6m: 'How the sector\'s price actually moved over the 126 trading days (≈6 calendar months) after the score was computed.',
  fwd_return_1y: 'How the sector\'s price actually moved over the 252 trading days (≈1 calendar year) after the score was computed.',
}
