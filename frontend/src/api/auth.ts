import { apiGet, apiPost } from './client';
import type { Gender } from '../gender';

export const signupEmail = (
  firstName: string,
  lastName: string | undefined,
  userName: string,
  email: string,
  password: string,
  gender?: Gender,
) =>
  // Only ever called once the terms checkbox is ticked (SignupPage).
  apiPost<{ accessToken: string }>('/auth/signup/email', {
    firstName,
    lastName,
    userName,
    email,
    password,
    gender,
    acceptTerms: true,
  });

export const loginEmail = (email: string, password: string) =>
  apiPost<{ accessToken: string }>('/auth/login/email', { email, password });

export const signupGoogle = (
  firstName: string,
  lastName: string | undefined,
  userName: string,
  idToken: string,
  gender?: Gender,
) =>
  apiPost<{ accessToken: string }>('/auth/signup/google', {
    firstName,
    lastName,
    userName,
    idToken,
    gender,
    acceptTerms: true,
  });

export const loginPhone = (phone: string, password: string) =>
  apiPost<{ accessToken: string }>('/auth/login/phone', { phone, password });

export const loginGoogle = (idToken: string) =>
  apiPost<{ accessToken: string }>('/auth/login/google', { idToken });

export const linkGoogle = (idToken: string) =>
  apiPost<{ message: string }>('/auth/link/google', { idToken });

export const requestOtp = (phone: string) => apiPost<{ userId: string }>('/auth/otp/request', { phone });

export const verifyOtp = (userId: string, code: string) =>
  apiPost<{ accessToken: string }>('/auth/otp/verify', { userId, code });

export const requestPasswordReset = (email: string) =>
  apiPost<{ message: string }>('/auth/password-reset/request', { email });

export const confirmPasswordReset = (token: string, newPassword: string) =>
  apiPost<{ message: string }>('/auth/password-reset/confirm', { token, newPassword });

// Lost phone: the 1st circle confirms in the app, then a code to the new number.
export const requestPhoneRecovery = (phone: string, newPhone: string) =>
  apiPost<{ message: string }>('/auth/phone-recovery/request', { phone, newPhone });

export const verifyPhoneRecovery = (newPhone: string, code: string) =>
  apiPost<{ message: string }>('/auth/phone-recovery/verify', { newPhone, code });

// Dev-only — backend refuses in production regardless.

export type LoginMethod = 'EMAIL_PASSWORD' | 'PHONE_PASSWORD' | 'GOOGLE' | 'SMS_CODE';

// One sign-in attempt on my account (newest first), for my Settings.
export interface LoginEvent {
  createdAt: string;
  method: LoginMethod;
  success: boolean;
  // The network, never the exact address ("203.0.113.x").
  ipPrefix: string | null;
  userAgent: string | null;
}

export const listMyLogins = () => apiGet<LoginEvent[]>('/auth/logins');

// Every device is signed out, this one included.
export const logoutEverywhere = () => apiPost<{ message: string }>('/auth/logout-everywhere', {});
