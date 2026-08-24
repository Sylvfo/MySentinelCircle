import { apiGet, apiPost } from './client';

export interface Me {
  id: string;
  firstName: string;
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
}

export type SignupResult = { userId: string } | { accessToken: string };

export const signupEmail = (
  firstName: string,
  lastName: string | undefined,
  userName: string,
  email: string,
  password: string,
  phone: string | undefined,
) =>
  apiPost<SignupResult>('/auth/signup/email', { firstName, lastName, userName, email, password, phone });

export const loginEmail = (email: string, password: string) =>
  apiPost<{ accessToken: string }>('/auth/login/email', { email, password });

export const signupGoogle = (
  firstName: string,
  lastName: string | undefined,
  userName: string,
  phone: string | undefined,
  idToken: string,
) => apiPost<SignupResult>('/auth/signup/google', { firstName, lastName, userName, phone, idToken });

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
