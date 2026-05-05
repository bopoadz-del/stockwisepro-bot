import { marketIndices, mockStocks } from '@/lib/data';
import { formatCurrency, formatPercentage } from '@/lib/utils';

export function LiveTicker() {
  // Combine indices and top stocks for ticker
  const tickerItems = [
    ...marketIndices.map((index) => ({
      symbol: index.symbol,
      name: index.name,
      price: index.price,
      change: index.change,
      changePercent: index.changePercent,
    })),
    ...mockStocks.slice(0, 6).map((stock) => ({
      symbol: stock.ticker,
      name: stock.name,
      price: stock.price,
      change: stock.change,
      changePercent: stock.changePercent,
    })),
  ];

  // Duplicate for seamless loop
  const allItems = [...tickerItems, ...tickerItems];

  return (
    <div className="w-full bg-[#141414] border-y border-white/10 overflow-hidden py-3">
      <div className="animate-ticker flex gap-8 whitespace-nowrap">
        {allItems.map((item, index) => (
          <div key={`${item.symbol}-${index}`} className="flex items-center gap-3">
            <span className="font-semibold text-white">{item.symbol}</span>
            <span className="text-white/60 text-sm hidden sm:inline">{item.name}</span>
            <span className="font-mono text-white">{formatCurrency(item.price)}</span>
            <span
              className={`font-mono text-sm ${
                item.change >= 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {formatPercentage(item.changePercent)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
