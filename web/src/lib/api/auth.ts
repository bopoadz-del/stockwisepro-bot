import { apiClient } from './client';

export interface User {
  id: number;
  email: string;
  name: string | null;
}

export interface LoginResponse {
  message: string;
  user: User;
  token: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export const authApi = {
  register: (data: RegisterData) =>
    apiClient.post<LoginResponse>('/auth/register', data),

  login: (data: LoginData) =>
    apiClient.post<LoginResponse>('/auth/login', data),

  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post('/auth/reset-password', { token, password }),
};
