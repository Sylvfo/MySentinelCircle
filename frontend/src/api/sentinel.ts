import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type SentinelType = 'SENTINEL' | 'SENTINEL_PLUS';
export type MembershipStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
export type InitiatedBy = 'ME' | 'SENTINEL';

export interface CircleContact {
  id: string;
  name: string | null;
  phone: string;
  userId: string | null;
}

export interface Membership {
  id: string;
  circleId: string;
  sentinelType: SentinelType;
  isReference: boolean;
  status: MembershipStatus;
  initiatedBy: InitiatedBy;
  createdAt: string;
  contact: CircleContact;
}

export interface Circle {
  id: string;
  label: string;
  isPrimary: boolean;
  createdAt: string;
  memberships: Membership[];
}

export interface PersonRef {
  id: string;
  email: string | null;
  phone: string;
}

export interface IncomingRequest {
  id: string;
  sentinelType: SentinelType;
  isReference: boolean;
  createdAt: string;
  circle: { id: string; label: string };
  contact: CircleContact;
}

export interface Invitation {
  id: string;
  sentinelType: SentinelType;
  isReference: boolean;
  createdAt: string;
  circle: { id: string; label: string; owner: PersonRef };
}

export interface Companion {
  membershipId: string;
  sentinelType: SentinelType;
  isReference: boolean;
  circle: { id: string; label: string; isPrimary: boolean };
  companion: PersonRef;
}

// ---- Circles (owner side) ---------------------------------------------------

export const listCircles = () => apiGet<Circle[]>('/sentinel/circles');

export const createCircle = (label: string) => apiPost<Circle>('/sentinel/circles', { label });

export const updateCircle = (id: string, data: { label?: string }) =>
  apiPatch<Circle>(`/sentinel/circles/${id}`, data);

export const deleteCircle = (id: string) => apiDelete<{ deleted: true }>(`/sentinel/circles/${id}`);

export interface InvitePayload {
  phone: string;
  name: string;
  sentinelType?: SentinelType;
  isReference?: boolean;
}

export const inviteSentinel = (circleId: string, data: InvitePayload) =>
  apiPost<Membership>(`/sentinel/circles/${circleId}/invite`, data);

// ---- Memberships ------------------------------------------------------------

export const updateMembership = (
  id: string,
  data: { sentinelType?: SentinelType; isReference?: boolean; circleId?: string },
) => apiPatch<Membership>(`/sentinel/memberships/${id}`, data);

export const removeMembership = (id: string) =>
  apiDelete<{ deleted: true }>(`/sentinel/memberships/${id}`);

export const acceptMembership = (id: string) =>
  apiPost<Membership>(`/sentinel/memberships/${id}/accept`, {});

export const declineMembership = (id: string) =>
  apiPost<Membership>(`/sentinel/memberships/${id}/decline`, {});

export const leaveMembership = (id: string) =>
  apiPost<Membership>(`/sentinel/memberships/${id}/leave`, {});

// ---- Inboxes & reverse views ------------------------------------------------

export const listIncomingRequests = () => apiGet<IncomingRequest[]>('/sentinel/requests');

export const listMyInvitations = () => apiGet<Invitation[]>('/sentinel/invitations');

export const requestToBeSentinel = (targetPhone: string) =>
  apiPost<Membership>('/sentinel/requests', { targetPhone });

export const listCompanions = () => apiGet<Companion[]>('/sentinel/companions');
