import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw, Save, Copy, Check, FlaskConical, Code2, LineChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { stocksApi } from '@/lib/api/stocks';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Experiment {
  id: string;
  name: string;
  formula: string;
  results: { ticker: string; score: number; oldScore: number }[];
  createdAt: string;
}

const defaultFormula = `// Custom Scoring Formula
// Available variables:
// - pe: P/E ratio
// - pb: Price/Book ratio  
// - ps: Price/Sales ratio
// - roe: Return on Equity
// - roa: Return on Assets
// - debtEquity: Debt to Equity ratio
// - currentRatio: Current ratio

function calculateScore(metrics) {
  const { pe, pb, ps, roe, roa, debtEquity, currentRatio } = metrics;
  
  // Valuation (lower is better)
  const valuation = Math.max(0, 100 - (pe * 2 + pb * 10 + ps * 5));
  
  // Profitability (higher is better)
  const profitability = Math.min(100, (roe * 200 + roa * 300));
  
  // Financial Health
  const health = Math.max(0, 100 - debtEquity * 30 + (currentRatio - 1) * 20);
  
  // Weighted average
  return Math.round(valuation * 0.4 + profitability * 0.35 + health * 0.25);
}`;

const sampleTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM'];

export function ExperimentWorkspace() {
  const [formula, setFormula] = useLocalStorage('experiment-formula', defaultFormula);
  const [experiments, setExperiments] = useLocalStorage<Experiment[]>('experiments', []);
  const [isRunning, setIsRunning] = useState(false);
  const [currentResults, setCurrentResults] = useState<{ ticker: string; score: number; oldScore: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Experiment state is managed by existing hooks

  const runExperiment = async () => {
    setIsRunning(true);
    setError(null);
    const results: { ticker: string; score: number; oldScore: number }[] = [];

    try {
      // Create function from formula string
      const formulaFn = new Function('metrics', `
        ${formula}
        return calculateScore(metrics);
      `);

      for (const ticker of sampleTickers) {
        try {
          const [quoteResponse, metricsResponse] = await Promise.all([
            stocksApi.getQuote(ticker),
            stocksApi.getKeyMetrics(ticker),
          ]);

          const quote = quoteResponse.data;
          const metrics = metricsResponse.data;

          if (metrics) {
            // Calculate simple old score
            let oldScore = 50;
            if (metrics.peRatio && metrics.peRatio > 0) {
              if (metrics.peRatio < 15) oldScore += 15;
              else if (metrics.peRatio < 25) oldScore += 10;
              else if (metrics.peRatio < 40) oldScore += 5;
              else oldScore -= 5;
            }
            if (quote?.changesPercentage) {
              if (quote.changesPercentage > 5) oldScore += 10;
              else if (quote.changesPercentage > 0) oldScore += 5;
              else if (quote.changesPercentage < -5) oldScore -= 10;
              else if (quote.changesPercentage < 0) oldScore -= 5;
            }
            oldScore = Math.max(0, Math.min(100, oldScore));
            
            const metricsInput = {
              pe: metrics.peRatio || 20,
              pb: metrics.priceToBookRatio || 3,
              ps: metrics.priceToSalesRatio || 5,
              roe: metrics.roe || 0.1,
              roa: metrics.roa || 0.05,
              debtEquity: metrics.debtToEquity || 0.5,
              currentRatio: metrics.currentRatio || 1.5,
            };

            const newScore = formulaFn(metricsInput);
            results.push({ ticker, score: Math.min(100, Math.max(0, newScore)), oldScore });
          }
        } catch (err) {
          console.error(`Error processing ${ticker}:`, err);
        }
      }

      setCurrentResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Formula error');
    } finally {
      setIsRunning(false);
    }
  };

  const saveExperiment = () => {
    const newExperiment: Experiment = {
      id: Date.now().toString(),
      name: `Experiment ${experiments.length + 1}`,
      formula,
      results: currentResults,
      createdAt: new Date().toISOString(),
    };
    setExperiments([newExperiment, ...experiments]);
  };

  const copyFormula = () => {
    navigator.clipboard.writeText(formula);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const chartData = currentResults.map((r) => ({
    ticker: r.ticker,
    oldScore: r.oldScore,
    newScore: r.score,
    difference: r.score - r.oldScore,
  }));

  return (
    <div className="bg-[#0a0a0a] rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#141414]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Formula Lab</h3>
            <p className="text-white/50 text-sm">Experiment with custom scoring algorithms</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyFormula}
            className="border-white/20 text-white/70"
          >
            {copied ? <Check size={14} className="mr-2" /> : <Copy size={14} className="mr-2" />}
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFormula(defaultFormula)}
            className="border-white/20 text-white/70"
          >
            <RotateCcw size={14} className="mr-2" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={runExperiment}
            disabled={isRunning}
            className="bg-purple-500 hover:bg-purple-600 text-white"
          >
            <Play size={14} className="mr-2" />
            {isRunning ? 'Running...' : 'Run'}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2">
        {/* Formula Editor */}
        <div className="border-r border-white/10">
          <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border-b border-white/10">
            <Code2 size={14} className="text-white/50" />
            <span className="text-white/50 text-sm">formula.js</span>
          </div>
          <textarea
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            className="w-full h-96 p-4 bg-[#0f0f0f] text-white font-mono text-sm resize-none focus:outline-none"
            spellCheck={false}
          />
          {error && (
            <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30 text-red-500 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="bg-[#141414]">
          <Tabs defaultValue="results" className="w-full">
            <TabsList className="w-full bg-transparent border-b border-white/10 rounded-none">
              <TabsTrigger
                value="results"
                className="flex-1 data-[state=active]:bg-white/5 data-[state=active]:text-white rounded-none"
              >
                Results
              </TabsTrigger>
              <TabsTrigger
                value="chart"
                className="flex-1 data-[state=active]:bg-white/5 data-[state=active]:text-white rounded-none"
              >
                Chart
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="flex-1 data-[state=active]:bg-white/5 data-[state=active]:text-white rounded-none"
              >
                History ({experiments.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="results" className="m-0 p-4">
              {currentResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <FlaskConical size={48} className="text-white/20 mb-4" />
                  <p className="text-white/50">Run the experiment to see results</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-white/50 text-sm mb-2">
                    <span>Stock</span>
                    <span className="flex gap-8">
                      <span>Old Score</span>
                      <span>New Score</span>
                      <span>Change</span>
                    </span>
                  </div>
                  {currentResults.map((result) => (
                    <motion.div
                      key={result.ticker}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-3 bg-[#1f1f1f] rounded-lg"
                    >
                      <span className="text-white font-medium">{result.ticker}</span>
                      <div className="flex gap-8 text-right">
                        <span className="text-white/60 w-16">{result.oldScore}</span>
                        <span className="text-white font-mono w-16">{result.score}</span>
                        <span
                          className={`w-16 font-mono ${
                            result.score > result.oldScore
                              ? 'text-green-500'
                              : result.score < result.oldScore
                              ? 'text-red-500'
                              : 'text-white/50'
                          }`}
                        >
                          {result.score > result.oldScore ? '+' : ''}
                          {result.score - result.oldScore}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                  <Button
                    onClick={saveExperiment}
                    className="w-full mt-4 bg-gold hover:bg-gold-light text-[#0a0a0a]"
                  >
                    <Save size={16} className="mr-2" />
                    Save Experiment
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="chart" className="m-0 p-4">
              {chartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <LineChart size={48} className="text-white/20 mb-4" />
                  <p className="text-white/50">Run the experiment to see chart</p>
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReLineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis
                        dataKey="ticker"
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                      />
                      <YAxis
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                        domain={[0, 100]}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f1f1f',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'white' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="oldScore"
                        stroke="#6b7280"
                        strokeWidth={2}
                        name="Original Score"
                        dot={{ fill: '#6b7280' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="newScore"
                        stroke="#c9a962"
                        strokeWidth={2}
                        name="New Score"
                        dot={{ fill: '#c9a962' }}
                      />
                    </ReLineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="m-0 p-4">
              {experiments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Save size={48} className="text-white/20 mb-4" />
                  <p className="text-white/50">No saved experiments yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {experiments.map((exp) => (
                    <div
                      key={exp.id}
                      className="p-4 bg-[#1f1f1f] rounded-lg cursor-pointer hover:bg-[#252525] transition-colors"
                      onClick={() => {
                        setFormula(exp.formula);
                        setCurrentResults(exp.results);
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-medium">{exp.name}</span>
                        <span className="text-white/40 text-sm">
                          {new Date(exp.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-white/50">
                          {exp.results.length} stocks tested
                        </span>
                        <span className="text-white/50">
                          Avg: {Math.round(exp.results.reduce((a, b) => a + b.score, 0) / exp.results.length)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
