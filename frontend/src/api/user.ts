import { API_URL, ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPostForm, getToken } from './client';

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
  // General switch: during an alert, may my Sentinels of other circles chat
  // with my 1st circle? Off = nobody; on = each circle decides.
  alertChatWithFirstCircle: boolean;
  createdAt: string;
  updatedAt: string;
  avatarPath?: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  hasPaid: boolean;
}

export const fetchMe = () => apiGet<Me>('/user/me');

export const updateProfile = (
  dto: Partial<
    Pick<Me, 'firstName' | 'lastName' | 'userName' | 'isMajor' | 'publicStatus' | 'alertChatWithFirstCircle'>
  >,
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

export const removeAvatar = () => apiDelete<Me>('/user/me/avatar');

// Profile photos are private (only linked people may see them), so they
// can't be a plain <img src>: fetched with the token, as a blob — see
// avatars.ts. Rejects with 404 when there's no photo or no access.
export async function fetchAvatarBlob(userId: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_URL}/user/${userId}/avatar`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

export const stepUpPassword = (password: string) =>
  apiPost<{ message: string }>('/user/me/step-up/password', { password });

export const stepUpGoogle = (idToken: string) =>
  apiPost<{ message: string }>('/user/me/step-up/google', { idToken });

export const stepUpCodeRequest = (channel: 'phone' | 'email') =>
  apiPost<{ message: string }>('/user/me/step-up/code/request', { channel });

export const stepUpCodeVerify = (code: string) =>
  apiPost<{ message: string }>('/user/me/step-up/code/verify', { code });

export const completeProfile = (firstName: string, password: string, lastName?: string) =>
  apiPost<Me>('/user/me/complete-profile', { firstName, password, lastName });

export const deleteAccount = () => apiDelete<{ message: string }>('/user/me');

export const setPassword = (newPassword: string) =>
  apiPost<{ message: string }>('/user/me/set-password', { newPassword });

export const requestEmailChange = (newEmail: string) =>
  apiPost<{ message: string }>('/user/me/change-email/request', { newEmail });

export const confirmEmailChange = (token: string) =>
  apiPost<{ message: string }>('/user/confirm-email', { token });

// TEMPORARY dev/test affordance — stands in for a real payment provider.
export const devSetHasPaid = (hasPaid: boolean) =>
  apiPost<Me>('/user/me/dev-has-paid', { hasPaid });

// ---- Death notice (prepared while alive) --------------------------------------

export interface DeathNoticeRecipientOption {
  linkId: string;
  sentinelLabel: string;
  notifyOnDeath: boolean;
  personalMessage: string | null;
}

export interface DeathNotice {
  announcementMessage: string;
  recipients: DeathNoticeRecipientOption[];
}

export const getMyDeathNotice = () => apiGet<DeathNotice>('/user/death-notice');

export const updateMyDeathNotice = (announcementMessage: string) =>
  apiPatch<{ announcementMessage: string }>('/user/death-notice', { announcementMessage });

export const setDeathNoticeRecipients = (
  recipients: { linkId: string; personalMessage?: string }[],
) => apiPatch<{ recipients: DeathNoticeRecipientOption[] }>('/user/death-notice/recipients', { recipients });
