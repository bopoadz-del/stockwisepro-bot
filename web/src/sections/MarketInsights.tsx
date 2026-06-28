import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Target, Database, Bell, Sparkles, Loader2 } from 'lucide-react';
import { liveApi, type MarketInsights as MarketInsightsData } from '@/lib/api/live';
import { useTranslation } from '@/contexts/LanguageContext';
import { ScrollReveal } from '@/components/ScrollReveal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function signed(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : `${r}`;
}

export function MarketInsights() {
  const { t, lang } = useTranslation();
  const [data, setData] = useState<MarketInsightsData | null>(null);

  // "Explain with AI" — one-shot, not a chat.
  const [aiTicker, setAiTicker] = useState('');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleExplain = async (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = aiTicker.trim().toUpperCase();
    if (!ticker) return;
    setAiLoading(true);
    setAiSummary(null);
    setAiError(null);
    const res = await liveApi.explain(ticker, lang);
    setAiLoading(false);
    if (res.data?.summary) {
      setAiSummary(res.data.summary);
    } else {
      const err = res.error || '';
      setAiError(
        /configured/i.test(err) ? t('insights.ai.disabled')
        : /No data/i.test(err) ? t('insights.ai.noData')
        : t('insights.ai.error')
      );
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const res = await liveApi.getInsights();
      if (mounted && res.data) setData(res.data);
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const hasData = !!data && data.dataset.snapshots >= 5;
  const hitRate = data?.accuracy.hitRate != null ? `${Math.round(data.accuracy.hitRate * 100)}%` : t('insights.none');

  return (
    <section id="insights" className="py-16 bg-[#0a0a0a]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              {t('insights.title')} <span className="text-gradient-gold">{t('insights.titleHighlight')}</span>
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">{t('insights.subtitle')}</p>
          </div>
        </ScrollReveal>

        {!hasData ? (
          <ScrollReveal>
            <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-8 text-center">
              <Database className="mx-auto text-gold/70 mb-3" size={28} />
              <p className="text-white/60 max-w-xl mx-auto">{t('insights.empty')}</p>
            </div>
          </ScrollReveal>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <ScrollReveal>
                <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-white/50 text-sm mb-2"><Database size={16} /> {t('insights.snapshots')}</div>
                  <div className="text-3xl font-bold text-white">{data!.dataset.snapshots.toLocaleString()}</div>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={0.05}>
                <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-white/50 text-sm mb-2"><TrendingUp size={16} /> {t('insights.tickers')}</div>
                  <div className="text-3xl font-bold text-white">{data!.dataset.tickers.toLocaleString()}</div>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={0.1}>
                <div className="bg-[#1f1f1f] border border-gold/30 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-gold/80 text-sm mb-2"><Target size={16} /> {t('insights.hitRate')}</div>
                  <div className="text-3xl font-bold text-gold">{hitRate}</div>
                  <div className="text-white/40 text-xs mt-1">
                    {t('insights.hitRateSub', { hits: data!.accuracy.hits, evaluated: data!.accuracy.evaluated })}
                  </div>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={0.15}>
                <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-white/50 text-sm mb-2"><Bell size={16} /> {t('insights.mostAlerted')}</div>
                  <div className="text-sm text-white/80 space-y-1 mt-1">
                    {data!.mostAlerted.length === 0
                      ? <span className="text-white/40">{t('insights.none')}</span>
                      : data!.mostAlerted.slice(0, 3).map(a => (
                          <div key={a.ticker} className="flex justify-between"><span>{a.ticker}</span><span className="text-white/40">{a.count}</span></div>
                        ))}
                  </div>
                </div>
              </ScrollReveal>
            </div>

            {/* Movers */}
            <div className="grid md:grid-cols-2 gap-4">
              <ScrollReveal>
                <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-green-500 font-semibold mb-3"><TrendingUp size={18} /> {t('insights.gainers')}</div>
                  <div className="space-y-2">
                    {data!.topGainers.length === 0 ? <span className="text-white/40 text-sm">{t('insights.none')}</span> :
                      data!.topGainers.map(g => (
                        <div key={g.ticker} className="flex justify-between text-sm">
                          <span className="text-white">{g.ticker}</span>
                          <span className="text-green-500 font-mono">{signed(g.trend)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={0.1}>
                <div className="bg-[#1f1f1f] border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-red-500 font-semibold mb-3"><TrendingDown size={18} /> {t('insights.losers')}</div>
                  <div className="space-y-2">
                    {data!.topLosers.length === 0 ? <span className="text-white/40 text-sm">{t('insights.none')}</span> :
                      data!.topLosers.map(g => (
                        <div key={g.ticker} className="flex justify-between text-sm">
                          <span className="text-white">{g.ticker}</span>
                          <span className="text-red-500 font-mono">{signed(g.trend)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </>
        )}

        {/* Explain with AI (one-shot) */}
        <ScrollReveal>
          <div className="mt-6 bg-[#1f1f1f] border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-2 text-gold font-semibold mb-3">
              <Sparkles size={18} /> {t('insights.ai.title')}
            </div>
            <form onSubmit={handleExplain} className="flex gap-2">
              <Input
                value={aiTicker}
                onChange={(e) => setAiTicker(e.target.value)}
                placeholder={t('insights.ai.placeholder')}
                className="bg-[#141414] border-white/10 text-white max-w-[200px]"
              />
              <Button
                type="submit"
                disabled={aiLoading || !aiTicker.trim()}
                className="bg-gold hover:bg-gold-light text-[#0a0a0a] font-semibold"
              >
                {aiLoading ? <Loader2 size={18} className="animate-spin" /> : t('insights.ai.button')}
              </Button>
            </form>

            {aiLoading && <p className="text-white/50 text-sm mt-3">{t('insights.ai.loading')}</p>}
            {aiError && <p className="text-red-400 text-sm mt-3">{aiError}</p>}
            {aiSummary && (
              <div className="mt-3">
                <p className="text-white/80 text-sm leading-relaxed whitespace-pre-line">{aiSummary}</p>
                <p className="text-white/30 text-xs mt-2">{t('insights.ai.disclaimer')}</p>
              </div>
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
