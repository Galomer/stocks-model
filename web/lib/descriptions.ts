/**
 * Plain-English descriptions for every metric the model uses.
 * Used in <InfoTip /> tooltips throughout the UI.
 */

export const CATEGORY_INFO: Record<string, { what: string; why: string }> = {
  momentum: {
    what: 'How stretched or washed-out the sector\'s recent price action looks — distance from moving averages, 1/3/6-month returns, RSI, and relative strength vs the market.',
    why:  'Important: a negative momentum score does NOT mean the sector is falling today. The model looks forward 1–3 months. When XLK (or any sector) has rallied hard, momentum often reads negative because the model treats that strength as “stretched” and flags higher pullback risk ahead.',
  },
  macro: {
    what: 'The interest-rate and credit environment: yield curve, credit spreads, the US Dollar, and sector commodities.',
    why:  'Scores are forward-looking. Tight credit spreads or a strong dollar can feel fine today but still read negative because they have historically preceded weaker sector returns over the next 1–3 months.',
  },
  sentiment: {
    what: 'Market mood via VIX, VIX term structure, and (when available) the CNN Fear & Greed Index.',
    why:  'Low fear / high complacency often reads negative — calm markets can precede pullbacks. Spikes in fear often read positive because they have historically been followed by recoveries.',
  },
  regime: {
    what: 'Cross-sector context: cyclical vs defensive leadership, how many sectors are above their 50-DMA, and correlation with the broad market.',
    why:  'When “everything looks great” (broad participation, cyclicals leading), the model often reads that as stretched and flags less upside ahead — even while prices are still rising.',
  },
}

export const FEATURE_INFO: Record<string, { what: string; why: string }> = {
  price_vs_50dma: {
    what: 'How far above or below the 50-day moving average the sector is trading right now.',
    why:  'When price is well above the 50-DMA (a strong recent run), this row often turns negative — not because price is falling, but because the model treats that stretch as higher pullback risk over the next 1–3 months.',
  },
  price_vs_200dma: {
    what: 'How far above or below the 200-day moving average the sector is trading right now.',
    why:  'Same forward logic as the 50-DMA: extended strength above the 200-DMA can read negative (stretched), while trading well below it can read positive (potential recovery ahead).',
  },
  roc_1m: {
    what: 'The percent change in the sector\'s price over the past month.',
    why:  'A hot 1-month run often reads negative here — the model learned that sharp short-term gains tend to mean-revert over the next 1–3 months.',
  },
  roc_3m: {
    what: 'The percent change in the sector\'s price over the past 3 months.',
    why:  'Strong 3-month performance can read negative: the model is asking “has this sector already run too far?” rather than “is it going up today?”',
  },
  roc_6m: {
    what: 'The percent change in the sector\'s price over the past 6 months.',
    why:  'Extended 6-month rallies often flip this signal negative — stretched trend, pullback risk ahead.',
  },
  relative_strength_3m: {
    what: 'How the sector has performed versus the S&P 500 (SPY) over the past 3 months.',
    why:  'Leading the market for 3 months can read negative: the model often treats outsized outperformance as due for a pause or reversal ahead.',
  },
  rsi: {
    what: 'The Relative Strength Index — a 0–100 oscillator of recent gains vs losses.',
    why:  'High RSI (overbought) often reads negative: price has been strong recently, but the model flags that as stretched for forward returns. Low RSI can read positive (oversold bounce potential).',
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
    why:  'Very tight spreads (low fear) often read negative — complacency can precede weaker equity returns ahead. Wide spreads can read positive (stress already priced in).',
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
    why:  'A market-wide regime gauge. When almost every sector is above its 50-DMA, the rally can look “too easy” — the model often treats that as stretched and flags less upside ahead over the next 1–3 months.',
  },
}

const DEFAULT_FEATURE_INFO = {
  what: 'One of the quantitative signals that feed the composite score.',
  why:
    'This score is about what the model expects over the next 1–3 months, not what already happened. Negative often means “stretched or headwind ahead”; positive often means “washed out or tailwind ahead.”',
}

/** Lookup with fallback so every feature row always has tooltip text. */
export function getFeatureInfo(name: string): { what: string; why: string } {
  return FEATURE_INFO[name] ?? {
    ...DEFAULT_FEATURE_INFO,
    what: `${DEFAULT_FEATURE_INFO.what} (${name.replace(/_/g, ' ')})`,
  }
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
