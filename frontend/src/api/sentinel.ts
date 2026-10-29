import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type SentinelType = 'ONLY_SMS' | 'SENTINEL' | 'LEAD' | 'FIRSTCIRCLE' | 'UNCOMPLETE';
export type LinkStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REMOVED' | 'BLOCKED';
export type LinkInitiator = 'COMPANION' | 'SENTINEL';
export type LeadSlot = 'LEAD_1' | 'LEAD_2' | 'LEAD_3';
export type CircleType = 'BASIC' | 'FIRST' | 'ORGANISATION' | 'RESERVED' | 'GROUP';
export type MessagingMode = 'NONE' | 'INDIVIDUAL' | 'GROUP';

export interface SentinelRef {
  id: string;
  firstName: string;
  phone: string;
}

export interface Membership {
  id: string;
  circleId: string;
  proposedCircleId: string | null;
  sentinelType: SentinelType;
  requestedAsLead: boolean;
  leadSlot: LeadSlot | null;
  status: LinkStatus;
  initiatedBy: LinkInitiator;
  createdAt: string;
  linkAsSentinel: SentinelRef;
  // Manual outer-circle call rank for batched alert escalation (lower =
  // called first); null = random order. Meaningless for the 1st circle.
  callOrder: number | null;
  // Alert-time: can this Sentinel join their own (1st) circle's live group
  // chat during an alert. Separate from canMessageMe below.
  canMessageOwnCircle: boolean;
  // Alert-time, outer-circle Sentinels only: can this Sentinel open a chat
  // with the 1st circle once solicited on an alert (frozen into that
  // alert's AlertParticipant.firstCircleMessagingModeAtAlert at contact
  // time — changing this afterward doesn't affect an alert already in
  // progress).
  firstCircleMessagingMode: MessagingMode;
  // The permanent Me<->Sentinel channel — null = inherit the circle's
  // (then the companion's) setting.
  canMessageMe: boolean | null;
}

export interface Circle {
  id: string;
  label: string;
  circleType: CircleType;
  createdAt: string;
  userSentinels: Membership[];
  // null = inherit the companion's default; always allowed on the 1st
  // circle, no override possible there.
  canMessageMe: boolean | null;
}

export interface PersonRef {
  id: string;
  email: string | null;
  phone: string | null;
}

export interface IncomingRequest {
  id: string;
  sentinelType: SentinelType;
  requestedAsLead: boolean;
  createdAt: string;
  circle: { id: string; label: string };
  linkAsSentinel: SentinelRef;
}

export interface Invitation {
  id: string;
  sentinelType: SentinelType;
  requestedAsLead: boolean;
  createdAt: string;
  circle: { id: string; label: string; userCompanion: PersonRef };
}

export interface Companion {
  linkId: string;
  sentinelType: SentinelType;
  leadSlot: LeadSlot | null;
  circle: { id: string; label: string; isPrimary: boolean };
  proposedCircle: { id: string; label: string } | null;
  companion: PersonRef;
}

// ---- Circles (companion side) -----------------------------------------------

export const listCircles = () => apiGet<Circle[]>('/sentinel/circles');

export const createCircle = (label: string) => apiPost<Circle>('/sentinel/circles', { label });

export const updateCircle = (id: string, data: { label?: string; canMessageMe?: boolean }) =>
  apiPatch<Circle>(`/sentinel/circles/${id}`, data);

export const deleteCircle = (id: string) => apiDelete<{ deleted: true }>(`/sentinel/circles/${id}`);

export interface InvitePayload {
  phone: string;
  name: string;
  sentinelType?: SentinelType;
  requestedAsLead?: boolean;
}

export const inviteSentinel = (circleId: string, data: InvitePayload) =>
  apiPost<Membership>(`/sentinel/circles/${circleId}/invite`, data);

// ---- Memberships --------------------------------------------------------------

export const updateMembership = (
  id: string,
  data: {
    sentinelType?: SentinelType;
    requestedAsLead?: boolean;
    circleId?: string;
    canMessageOwnCircle?: boolean;
    firstCircleMessagingMode?: MessagingMode;
    canMessageMe?: boolean;
    callOrder?: number;
  },
) => apiPatch<Membership>(`/sentinel/memberships/${id}`, data);

export const removeMembership = (id: string) =>
  apiDelete<{ deleted: true }>(`/sentinel/memberships/${id}`);

// circleId is only required when accepting a Sentinel-initiated request
// (the requester couldn't see the circle list, so "Me" picks it now).
export const acceptMembership = (id: string, circleId?: string) =>
  apiPost<Membership>(`/sentinel/memberships/${id}/accept`, { circleId });

export const declineMembership = (id: string) =>
  apiPost<Membership>(`/sentinel/memberships/${id}/decline`, {});

export const leaveMembership = (id: string) =>
  apiPost<Membership>(`/sentinel/memberships/${id}/leave`, {});

export const acceptCircleMove = (id: string) =>
  apiPost<Membership>(`/sentinel/memberships/${id}/circle-move/accept`, {});

export const declineCircleMove = (id: string) =>
  apiPost<Membership>(`/sentinel/memberships/${id}/circle-move/decline`, {});

// ---- Inboxes & reverse views --------------------------------------------------

export const listIncomingRequests = () => apiGet<IncomingRequest[]>('/sentinel/requests');

export const listMyInvitations = () => apiGet<Invitation[]>('/sentinel/invitations');

export const requestToBeSentinel = (targetPhone: string) =>
  apiPost<Membership>('/sentinel/requests', { targetPhone });

export const listCompanions = () => apiGet<Companion[]>('/sentinel/companions');

// ---- Groups (mutual mesh, invite-by-connection only) -------------------------

export interface GroupMember {
  id: string;
  firstName: string;
}

export interface Group {
  rootId: string;
  label: string;
  // Only the founder (whose own circle is the group's root) can delete
  // the whole group — everyone else can only leave it themselves.
  isFounder: boolean;
  members: GroupMember[];
}

export interface GroupInvitation {
  id: string;
  createdAt: string;
  groupRoot: { id: string; label: string };
  invitedBy: { id: string; firstName: string };
}

export const createGroup = (label: string) => apiPost<Circle>('/sentinel/groups', { label });

export const listMyGroups = () => apiGet<Group[]>('/sentinel/groups');

export const listMyGroupInvitations = () =>
  apiGet<GroupInvitation[]>('/sentinel/groups/invitations');

export const inviteToGroup = (rootId: string, targetUserId: string) =>
  apiPost<{ id: string; status: LinkStatus }>(`/sentinel/groups/${rootId}/invite`, { targetUserId });

export const acceptGroupInvitation = (id: string) =>
  apiPost<Circle>(`/sentinel/groups/invitations/${id}/accept`, {});

export const declineGroupInvitation = (id: string) =>
  apiPost<{ id: string; status: LinkStatus }>(`/sentinel/groups/invitations/${id}/decline`, {});

export const leaveGroup = (rootId: string) =>
  apiPost<{ left: true }>(`/sentinel/groups/${rootId}/leave`, {});

export const deleteGroup = (rootId: string) =>
  apiDelete<{ deleted: true }>(`/sentinel/groups/${rootId}`);
