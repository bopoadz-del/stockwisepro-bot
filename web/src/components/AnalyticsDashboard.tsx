import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, MousePointer, TrendingUp, Activity, Eye, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analytics } from '@/lib/analytics';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface AnalyticsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AnalyticsData {
  totalEvents: number;
  pageViews: { path: string; count: number }[];
  featureUsage: { feature: string; count: number }[];
  stockInteractions: { ticker: string; count: number }[];
  events: any[];
}

export function AnalyticsDashboard({ isOpen, onClose }: AnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'stocks'>('overview');

  useEffect(() => {
    if (isOpen) {
      loadAnalytics();
    }
  }, [isOpen]);

  const loadAnalytics = () => {
    const summary = analytics.getSessionSummary();
    const events = summary.events || [];

    // Process page views
    const pageViews: Record<string, number> = {};
    const featureUsage: Record<string, number> = {};
    const stockInteractions: Record<string, number> = {};

    events.forEach((event: any) => {
      if (event.type === 'page_view') {
        pageViews[event.data.path] = (pageViews[event.data.path] || 0) + 1;
      }
      if (event.type === 'feature_usage') {
        featureUsage[event.data.feature] = (featureUsage[event.data.feature] || 0) + 1;
      }
      if (event.type === 'stock_interaction') {
        stockInteractions[event.data.ticker] = (stockInteractions[event.data.ticker] || 0) + 1;
      }
    });

    setData({
      totalEvents: summary.totalEvents,
      pageViews: Object.entries(pageViews).map(([path, count]) => ({ path, count })),
      featureUsage: Object.entries(featureUsage).map(([feature, count]) => ({ feature, count })),
      stockInteractions: Object.entries(stockInteractions).map(([ticker, count]) => ({ ticker, count })),
      events: events.slice(-50), // Last 50 events
    });
  };

  const clearData = () => {
    analytics.clearStoredEvents();
    loadAnalytics();
  };

  const COLORS = ['#c9a962', '#22c55e', '#3b82f6', '#ec4899', '#f59e0b', '#8b5cf6'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-5xl max-h-[90vh] bg-[#141414] rounded-2xl border border-white/10 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-gold" size={24} />
            <div>
              <h2 className="text-xl font-bold text-white">Analytics Dashboard</h2>
              <p className="text-white/50 text-sm">User behavior tracking for testing</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={clearData}
              className="border-white/20 text-white/70 hover:text-white"
            >
              Clear Data
            </Button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={20} className="text-white/50" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'events', label: 'Events', icon: Eye },
            { id: 'stocks', label: 'Stock Activity', icon: TrendingUp },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-gold border-b-2 border-gold'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {!data || data.totalEvents === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity size={48} className="text-white/20 mb-4" />
              <h3 className="text-white font-semibold mb-2">No Data Yet</h3>
              <p className="text-white/50 max-w-md">
                Start using the app to collect analytics data. Events will appear here as users interact with the platform.
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-2 text-white/50 mb-2">
                        <MousePointer size={16} />
                        <span className="text-sm">Total Events</span>
                      </div>
                      <div className="text-3xl font-bold text-white">{data.totalEvents}</div>
                    </div>
                    <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-2 text-white/50 mb-2">
                        <Eye size={16} />
                        <span className="text-sm">Page Views</span>
                      </div>
                      <div className="text-3xl font-bold text-white">
                        {data.pageViews.reduce((sum, p) => sum + p.count, 0)}
                      </div>
                    </div>
                    <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-2 text-white/50 mb-2">
                        <Activity size={16} />
                        <span className="text-sm">Features Used</span>
                      </div>
                      <div className="text-3xl font-bold text-white">{data.featureUsage.length}</div>
                    </div>
                    <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-2 text-white/50 mb-2">
                        <TrendingUp size={16} />
                        <span className="text-sm">Stocks Viewed</span>
                      </div>
                      <div className="text-3xl font-bold text-white">{data.stockInteractions.length}</div>
                    </div>
                  </div>

                  {/* Charts */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Feature Usage */}
                    <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
                      <h3 className="text-white font-semibold mb-4">Feature Usage</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data.featureUsage}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis
                              dataKey="feature"
                              stroke="rgba(255,255,255,0.3)"
                              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                            />
                            <YAxis
                              stroke="rgba(255,255,255,0.3)"
                              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#1f1f1f',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                              }}
                            />
                            <Bar dataKey="count" fill="#c9a962" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Page Views */}
                    <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
                      <h3 className="text-white font-semibold mb-4">Page Views</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data.pageViews}
                              dataKey="count"
                              nameKey="path"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label
                            >
                              {data.pageViews.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#1f1f1f',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'events' && (
                <div className="space-y-4">
                  <h3 className="text-white font-semibold">Recent Events</h3>
                  <div className="space-y-2">
                    {[...data.events].reverse().map((event, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-[#1f1f1f] rounded-lg border border-white/10"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              event.type === 'page_view'
                                ? 'bg-blue-500/20 text-blue-400'
                                : event.type === 'feature_usage'
                                ? 'bg-green-500/20 text-green-400'
                                : event.type === 'stock_interaction'
                                ? 'bg-gold/20 text-gold'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}
                          >
                            {event.type}
                          </span>
                          <span className="text-white/70 text-sm">
                            {event.type === 'stock_interaction'
                              ? `${event.data.ticker} - ${event.data.action}`
                              : event.type === 'feature_usage'
                              ? event.data.feature
                              : event.type === 'page_view'
                              ? event.data.path
                              : JSON.stringify(event.data).slice(0, 50)}
                          </span>
                        </div>
                        <span className="text-white/40 text-xs">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'stocks' && (
                <div className="space-y-6">
                  <div className="bg-[#1f1f1f] rounded-xl p-4 border border-white/10">
                    <h3 className="text-white font-semibold mb-4">Most Viewed Stocks</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.stockInteractions.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                          <XAxis
                            type="number"
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                          />
                          <YAxis
                            type="category"
                            dataKey="ticker"
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                            width={60}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#1f1f1f',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '8px',
                            }}
                          />
                          <Bar dataKey="count" fill="#c9a962" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {data.stockInteractions.slice(0, 6).map((stock, index) => (
                      <div
                        key={stock.ticker}
                        className="flex items-center justify-between p-4 bg-[#1f1f1f] rounded-xl border border-white/10"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                            style={{ backgroundColor: `${COLORS[index % COLORS.length]}20`, color: COLORS[index % COLORS.length] }}
                          >
                            {stock.ticker[0]}
                          </div>
                          <span className="text-white font-medium">{stock.ticker}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Activity size={16} className="text-white/40" />
                          <span className="text-gold font-bold">{stock.count}</span>
                          <span className="text-white/40 text-sm">interactions</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
