import { useEffect, useRef, useState, useCallback } from 'react';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

interface WebSocketMessage {
  type: string;
  data: unknown;
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [prices, setPrices] = useState<Record<string, any>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedTickersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // Re-subscribe to any previously subscribed tickers
      if (subscribedTickersRef.current.size > 0) {
        subscribe(Array.from(subscribedTickersRef.current));
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'prices:update':
            const updates = message.data as any[];
            setPrices((prev) => {
              const newPrices = { ...prev };
              updates.forEach((update) => {
                newPrices[update.symbol] = update;
              });
              return newPrices;
            });
            break;
          
          case 'alert:triggered':
            // Handle alert notification
            const alert = message.data as { ticker: string; targetPrice: number; condition: string };
            console.log('Alert triggered:', alert);
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, []);

  const subscribe = useCallback((tickers: string[]) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    tickers.forEach((ticker) => subscribedTickersRef.current.add(ticker));
    
    ws.send(JSON.stringify({
      type: 'subscribe:stocks',
      data: tickers,
    }));
  }, []);

  const unsubscribe = useCallback((tickers: string[]) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    tickers.forEach((ticker) => subscribedTickersRef.current.delete(ticker));
    
    ws.send(JSON.stringify({
      type: 'unsubscribe:stocks',
      data: tickers,
    }));
  }, []);

  return {
    isConnected,
    prices,
    subscribe,
    unsubscribe,
  };
}
