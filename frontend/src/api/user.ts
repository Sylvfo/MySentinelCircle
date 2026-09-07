import { apiGet, apiPatch, apiPost, apiPostForm } from './client';

export interface Me {
  id: string;
  firstName: string;
  lastName: string | null;
  userName: string | null;
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  status: string;
  userType: string;
  isMajor: boolean;
  publicStatus: string | null;
  createdAt: string;
  updatedAt: string;
  avatarPath?: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export const fetchMe = () => apiGet<Me>('/user/me');

export const updateProfile = (
  dto: Partial<Pick<Me, 'firstName' | 'lastName' | 'userName' | 'isMajor' | 'publicStatus'>>,
) => apiPatch<Me>('/user/me', dto);

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiPost<{ message: string }>('/user/me/change-password', { currentPassword, newPassword });

export const requestAddPhone = (phone: string) => apiPost<{ message: string }>('/user/phone/request', { phone });

export const verifyAddPhone = (code: string) => apiPost<Me>('/user/phone/verify', { code });

export const uploadAvatar = (file: File) => {
  const formData = new FormData();
  formData.append('avatar', file);
  return apiPostForm<Me>('/user/me/avatar', formData);
};

export const stepUpPassword = (password: string) =>
  apiPost<{ message: string }>('/user/me/step-up/password', { password });

export const stepUpGoogle = (idToken: string) =>
  apiPost<{ message: string }>('/user/me/step-up/google', { idToken });

export const stepUpCodeRequest = (channel: 'phone' | 'email') =>
  apiPost<{ message: string }>('/user/me/step-up/code/request', { channel });

export const stepUpCodeVerify = (code: string) =>
  apiPost<{ message: string }>('/user/me/step-up/code/verify', { code });

export const requestEmailChange = (newEmail: string) =>
  apiPost<{ message: string }>('/user/me/change-email/request', { newEmail });

export const confirmEmailChange = (token: string) =>
  apiPost<{ message: string }>('/user/confirm-email', { token });
