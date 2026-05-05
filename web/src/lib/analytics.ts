// Analytics and User Tracking System for StockWise Pro
// Collects user behavior data for testing and improvement

const ANALYTICS_ENDPOINT = import.meta.env.VITE_API_URL + '/analytics';

export interface UserSession {
  sessionId: string;
  userId?: string;
  startTime: string;
  deviceInfo: {
    userAgent: string;
    screenSize: string;
    platform: string;
  };
}

export interface PageView {
  path: string;
  timestamp: string;
  timeSpent: number;
}

export interface UserAction {
  type: string;
  payload: Record<string, any>;
  timestamp: string;
  path: string;
}

export interface StockInteraction {
  ticker: string;
  action: 'view' | 'add_to_watchlist' | 'set_alert' | 'compare' | 'score_view';
  timestamp: string;
  metadata?: Record<string, any>;
}

class Analytics {
  private sessionId: string;
  private userId: string | null = null;
  private pageStartTime: number = Date.now();
  private currentPath: string = window.location.pathname;
  private eventQueue: any[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initSession();
    this.startFlushInterval();
    this.trackPageView();
    this.setupVisibilityTracking();
  }

  private generateSessionId(): string {
    return 'sess_' + Math.random().toString(36).substring(2, 15);
  }

  private initSession() {
    const session: UserSession = {
      sessionId: this.sessionId,
      startTime: new Date().toISOString(),
      deviceInfo: {
        userAgent: navigator.userAgent,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        platform: navigator.platform,
      },
    };

    this.queueEvent('session_start', session);
  }

  setUserId(userId: string) {
    this.userId = userId;
    this.queueEvent('user_identify', { userId });
  }

  private startFlushInterval() {
    // Flush events every 10 seconds
    this.flushInterval = setInterval(() => {
      this.flushEvents();
    }, 10000);

    // Also flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flushEvents();
    });
  }

  private queueEvent(type: string, data: any) {
    const event = {
      type,
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      path: this.currentPath,
      data,
    };

    this.eventQueue.push(event);

    // Flush immediately if queue gets large
    if (this.eventQueue.length >= 10) {
      this.flushEvents();
    }
  }

  private async flushEvents() {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Store in localStorage as backup
      const stored = JSON.parse(localStorage.getItem('analytics_events') || '[]');
      localStorage.setItem('analytics_events', JSON.stringify([...stored, ...events]));

      // Try to send to server (silently fail on 404 - endpoint may not exist)
      if (navigator.onLine) {
        const response = await fetch(ANALYTICS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events }),
          keepalive: true,
        });
        // Silently ignore 404 - analytics endpoint is optional
        if (!response.ok && response.status !== 404) {
          console.log('Analytics server error:', response.status);
        }
      }
    } catch (error) {
      // Silently fail - analytics is not critical
    }
  }

  trackPageView(path?: string) {
    const now = Date.now();
    const timeSpent = now - this.pageStartTime;

    if (this.currentPath && timeSpent > 1000) {
      this.queueEvent('page_view', {
        path: this.currentPath,
        timeSpent,
        timestamp: new Date().toISOString(),
      });
    }

    this.currentPath = path || window.location.pathname;
    this.pageStartTime = now;
  }

  trackEvent(type: string, payload: Record<string, any> = {}) {
    this.queueEvent('custom_event', { type, payload });
  }

  trackStockInteraction(ticker: string, action: StockInteraction['action'], metadata?: Record<string, any>) {
    this.queueEvent('stock_interaction', {
      ticker,
      action,
      metadata,
    });
  }

  trackFeatureUsage(feature: string, details?: Record<string, any>) {
    this.queueEvent('feature_usage', {
      feature,
      details,
    });
  }

  trackError(error: Error, context?: Record<string, any>) {
    this.queueEvent('error', {
      message: error.message,
      stack: error.stack,
      context,
    });
  }

  private setupVisibilityTracking() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushEvents();
      }
    });
  }

  // Get analytics summary for dashboard
  getSessionSummary() {
    const stored = JSON.parse(localStorage.getItem('analytics_events') || '[]');
    
    return {
      sessionId: this.sessionId,
      totalEvents: stored.length,
      events: stored,
    };
  }

  clearStoredEvents() {
    localStorage.removeItem('analytics_events');
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

// Singleton instance
export const analytics = new Analytics();

// React hook for analytics
export function useAnalytics() {
  return {
    trackEvent: (type: string, payload?: Record<string, any>) => analytics.trackEvent(type, payload),
    trackStockInteraction: (ticker: string, action: StockInteraction['action'], metadata?: Record<string, any>) => 
      analytics.trackStockInteraction(ticker, action, metadata),
    trackFeatureUsage: (feature: string, details?: Record<string, any>) => 
      analytics.trackFeatureUsage(feature, details),
  };
}
