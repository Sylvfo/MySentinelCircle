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
}

export const fetchMe = () => apiGet<Me>('/user/me');

export const updateProfile = (
  dto: Partial<Pick<Me, 'firstName' | 'lastName' | 'userName' | 'isMajor' | 'publicStatus'>>,
) => apiPatch<Me>('/user/me', dto);

export const requestAddPhone = (phone: string) => apiPost<{ message: string }>('/user/phone/request', { phone });

export const verifyAddPhone = (code: string) => apiPost<Me>('/user/phone/verify', { code });

export const uploadAvatar = (file: File) => {
  const formData = new FormData();
  formData.append('avatar', file);
  return apiPostForm<Me>('/user/me/avatar', formData);
};
