import type { Gender } from '../gender';
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
  // Nobody else may raise an alert about me (I still can).
  pausedForMe: boolean;
  // I can't be asked to take part in any alert.
  pausedForOthers: boolean;
  createdAt: string;
  updatedAt: string;
  avatarPath?: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  hasPaid: boolean;
  // False until the current terms + privacy policy are accepted (TermsGate).
  termsUpToDate: boolean;
  // How texts speak about me; null = inclusive wording.
  gender: Gender | null;
}

export const fetchMe = () => apiGet<Me>('/user/me');

export const acceptTerms = () => apiPost<Me>('/user/me/accept-terms', {});

// What my plan includes right now (GET /user/me/plan). The backend
// enforces each rule; this only explains them and shows upgrade prompts.
export interface Plan {
  // Yearly subscription running right now.
  hasPaid: boolean;
  // Its end date (kept after it ends).
  paidUntil: string | null;
  // Whether the "pay" buttons work yet (simulated in dev, real later).
  paymentAvailable: boolean;
  freeAlertLimit: number;
  // null = unlimited (subscription).
  freeAlertsLeft: number | null;
  deathNotice: boolean;
  deathNoticePurchased: boolean;
  groups: boolean;
}

export const getPlan = () => apiGet<Plan>('/user/me/plan');

// One more year of subscription, for me or offered to someone I'm linked with.
export const addSubscriptionYear = (forUserId?: string) =>
  apiPost<{ userId: string; paidUntil: string }>('/user/me/subscription-year', { forUserId });

// TEMPORARY dev/test affordance, like devSetHasPaid.
export const devSetDeathNoticePurchased = (purchased: boolean) =>
  apiPost<Plan>('/user/me/dev-death-notice-purchase', { purchased });

export const updateProfile = (
  dto: Partial<
    Pick<
      Me,
      'firstName' | 'lastName' | 'userName' | 'isMajor' | 'publicStatus' | 'alertChatWithFirstCircle' | 'gender'
    >
  >,
) => apiPatch<Me>('/user/me', dto);

// Separate from updateProfile: turning pause for others on takes me out of
// every alert in progress (refused while I'm a Lead on one).
export const updatePause = (dto: Partial<Pick<Me, 'pausedForMe' | 'pausedForOthers'>>) =>
  apiPatch<Me>('/user/me/pause', dto);

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
