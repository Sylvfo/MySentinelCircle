import { apiGet, apiPost } from './client';

export interface Me {
  id: string;
  firstName: string;
  email: string | null;
  phone: string;
  phoneVerifiedAt: string | null;
  createdAt: string;
}

export const signupEmail = (firstName: string, email: string, password: string, phone: string) =>
  apiPost<{ userId: string }>('/auth/signup/email', { firstName, email, password, phone });

export const loginEmail = (email: string, password: string) =>
  apiPost<{ accessToken: string }>('/auth/login/email', { email, password });

export const signupGoogle = (firstName: string, phone: string, idToken: string) =>
  apiPost<{ userId: string }>('/auth/signup/google', { firstName, phone, idToken });

export const loginGoogle = (idToken: string) =>
  apiPost<{ accessToken: string }>('/auth/login/google', { idToken });

export const linkGoogle = (idToken: string) =>
  apiPost<{ message: string }>('/auth/link/google', { idToken });

export const requestOtp = (phone: string) => apiPost<{ userId: string }>('/auth/otp/request', { phone });

export const verifyOtp = (userId: string, code: string) =>
  apiPost<{ accessToken: string }>('/auth/otp/verify', { userId, code });

export const fetchMe = () => apiGet<Me>('/auth/me');

export const requestPasswordReset = (email: string) =>
  apiPost<{ message: string }>('/auth/password-reset/request', { email });

export const confirmPasswordReset = (token: string, newPassword: string) =>
  apiPost<{ message: string }>('/auth/password-reset/confirm', { token, newPassword });
