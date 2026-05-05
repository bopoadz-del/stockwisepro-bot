import { apiClient } from './client';

export interface PriceAlert {
  id: string;
  ticker: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
  isActive: boolean;
  wasTriggered: boolean;
  createdAt: string;
  triggeredAt: string | null;
}

export interface CreateAlertData {
  ticker: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
}

export const alertsApi = {
  getAll: () =>
    apiClient.get<PriceAlert[]>('/alerts'),

  create: (data: CreateAlertData) =>
    apiClient.post<PriceAlert>('/alerts', data),

  update: (id: string, updates: Partial<PriceAlert>) =>
    apiClient.patch<PriceAlert>(`/alerts/${id}`, updates),

  delete: (id: string) =>
    apiClient.delete(`/alerts/${id}`),

  getForStock: (ticker: string) =>
    apiClient.get<PriceAlert[]>(`/alerts/stock/${ticker}`),
};
