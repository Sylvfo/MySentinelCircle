import type { WatchView } from './watch';
import type { Gender } from '../gender';
import { apiDelete, apiGet, apiGetShared, apiPatch, apiPost } from './client';

export type SentinelType = 'ONLY_SMS' | 'SENTINEL' | 'LEAD' | 'FIRSTCIRCLE' | 'UNCOMPLETE';
export type LinkStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REMOVED' | 'BLOCKED';
export type LinkInitiator = 'COMPANION' | 'SENTINEL';
export type LeadSlot = 'LEAD_1' | 'LEAD_2' | 'LEAD_3';
export type CircleType = 'BASIC' | 'FIRST' | 'ORGANISATION' | 'RESERVED' | 'GROUP';

export interface SentinelRef {
  id: string;
  firstName: string;
  // Only listCircles() returns it (the Sentinel panel on a circle's page).
  lastName?: string | null;
  phone: string;
  // Profile photo's file name (listCircles() only) — a cache key for
  // avatars.ts, the photo itself needs GET /user/:id/avatar.
  avatarPath?: string | null;
  // Their status line, e.g. "On holiday until the 12th" (listCircles() only).
  publicStatus?: string | null;
  // On pause for others: can't be asked to take part in alerts (listCircles() only).
  pausedForOthers?: boolean;
  // Running yearly subscription (listCircles() only; never the end date).
  subscribed?: boolean;
  // How texts speak about them (listCircles() only); null = inclusive.
  gender?: Gender | null;
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
}

export interface Circle {
  id: string;
  label: string;
  circleType: CircleType;
  createdAt: string;
  userSentinels: Membership[];
  // Group circles only: the founder's circle (the group's root) has null,
  // every other member's circle points at it.
  groupRootId?: string | null;
  // During an alert, may this circle's Sentinels chat with the 1st circle?
  // Only counts when the companion's general switch (Me.
  // alertChatWithFirstCircle) is on; meaningless for the 1st circle itself.
  alertChatWithFirstCircle: boolean;
  // A travel circle (Watch Mode): its trip. Once the trip is over
  // (closedAt), it is a normal circle.
  trip?: TripRef | null;
}

export interface TripRef {
  id: string;
  label: string;
  closedAt: string | null;
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
  circle: { id: string; label: string; userCompanion: PersonRef & { firstName: string; gender?: Gender | null } };
}

// Pending report awaiting a second confirmation — canConfirmOrReject is
// false for the reporter themselves (they can't confirm/reject their own
// report, see SentinelService.assertCanSecondConfirm).
export interface DeathNoticePending {
  reportedAt: string;
  reportedByLabel: string;
  canConfirmOrReject: boolean;
}

export interface CompanionDeathNotice {
  isDeceased: boolean;
  pending: DeathNoticePending | null;
  canReport: boolean;
}

// They lost their phone and ask their 1st circle to vouch for them
// (PhoneRecoveryService). Only shown to their 1st circle.
export interface CompanionPhoneRecovery {
  newPhone: string;
  requestedAt: string;
  confirmedByMe: boolean;
  // Two people confirmed: the code went to the new number.
  codeSent: boolean;
}

export interface Companion {
  linkId: string;
  sentinelType: SentinelType;
  leadSlot: LeadSlot | null;
  circle: {
    id: string;
    label: string;
    isPrimary: boolean;
    isReserve: boolean;
    isGroup: boolean;
    // I was added for their trip (Watch Mode).
    trip?: TripRef | null;
  };
  // Their running watches I may know about (Watch Mode).
  watches?: WatchView[];
  proposedCircle: { id: string; label: string } | null;
  companion: PersonRef & {
    firstName: string;
    lastName: string | null;
    userName: string | null;
    avatarPath: string | null;
    publicStatus: string | null;
    // Nobody but them may raise an alert about them right now.
    pausedForMe: boolean;
    // Yearly subscription running: an alert can always be raised for them.
    subscribed: boolean;
    // No subscription and their free alert is used (offer them a year).
    freeAlertUsed: boolean;
    // How texts speak about them; null = inclusive wording.
    gender: Gender | null;
  };
  // The other accepted members of their 1st circle — empty unless I'm in it.
  firstCircleMembers: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    publicStatus: string | null;
    pausedForOthers: boolean;
    subscribed: boolean;
    gender: Gender | null;
    isLead: boolean;
  }[];
  phoneRecovery: CompanionPhoneRecovery | null;
  deathNotice: CompanionDeathNotice;
}

// ---- Circles (companion side) -----------------------------------------------

// Shared between pages for a few seconds (see apiGetShared).
export const listCircles = () => apiGetShared<Circle[]>('/sentinel/circles');

export interface SecurityScore {
  score: number;
  level: 'notReady' | 'minimum' | 'fair' | 'good' | 'great' | 'excellent';
  ready: boolean;
  missing: ('phone' | 'lead' | 'sentinel')[];
}

export const getSecurityScore = () => apiGet<SecurityScore>('/sentinel/security-score');

export const createCircle = (label: string) => apiPost<Circle>('/sentinel/circles', { label });

export const updateCircle = (id: string, data: { label?: string; alertChatWithFirstCircle?: boolean }) =>
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
    callOrder?: number;
    // Lead order in the 1st circle (Lead 1 = responsible when an alert starts).
    leadSlot?: LeadSlot;
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

// "Not available for now": I go to their reserve, the link stays.
export const moveSelfToReserve = (id: string) =>
  apiPost<Membership>(`/sentinel/memberships/${id}/reserve`, {});

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

// Shared between pages for a few seconds (see apiGetShared).
export const listCompanions = () => apiGetShared<Companion[]>('/sentinel/companions');

// ---- Death notice (report / confirm / reject by a qualifying Sentinel) ------

export const reportDeath = (companionId: string) =>
  apiPost<{ reported: true }>(`/sentinel/companions/${companionId}/death-notice/report`, {});

export const confirmDeath = (companionId: string) =>
  apiPost<{ confirmed: true }>(`/sentinel/companions/${companionId}/death-notice/confirm`, {});

export const rejectDeathReport = (companionId: string) =>
  apiPost<{ rejected: true }>(`/sentinel/companions/${companionId}/death-notice/reject`, {});

// ---- Lost phone (vouched for by their 1st circle) ---------------------------

export const confirmPhoneRecovery = (companionId: string) =>
  apiPost<{ confirmations: 1 | 2 }>(`/sentinel/companions/${companionId}/phone-recovery/confirm`, {});

export const rejectPhoneRecovery = (companionId: string) =>
  apiPost<{ rejected: true }>(`/sentinel/companions/${companionId}/phone-recovery/reject`, {});

export interface DeathNoticeAnnouncement {
  announcementMessage: string;
  personalMessage: string | null;
}

export interface MyDeathNotice extends DeathNoticeAnnouncement {
  companionName: string;
}

export const listMyDeathNotices = () => apiGet<MyDeathNotice[]>('/sentinel/death-notices/mine');

export const getDeathNoticeAnnouncement = (companionId: string) =>
  apiGet<DeathNoticeAnnouncement>(`/sentinel/companions/${companionId}/death-notice`);

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

// Either someone I'm connected to (targetUserId), or anyone by phone + first
// name — with no account, they get an SMS to create one with that number.
export const inviteToGroup = (
  rootId: string,
  target: { targetUserId: string } | { phone: string; name: string },
) => apiPost<{ id: string; status: LinkStatus }>(`/sentinel/groups/${rootId}/invite`, target);

export const acceptGroupInvitation = (id: string) =>
  apiPost<Circle>(`/sentinel/groups/invitations/${id}/accept`, {});

export const declineGroupInvitation = (id: string) =>
  apiPost<{ id: string; status: LinkStatus }>(`/sentinel/groups/invitations/${id}/decline`, {});

export const leaveGroup = (rootId: string) =>
  apiPost<{ left: true }>(`/sentinel/groups/${rootId}/leave`, {});

export const deleteGroup = (rootId: string) =>
  apiDelete<{ deleted: true }>(`/sentinel/groups/${rootId}`);

// From someone's page: end every link with them (both directions), or block
// them for good (both directions, never re-invitable).
export const endRelationship = (userId: string) =>
  apiPost<{ ended: number }>(`/sentinel/people/${userId}/end`, {});

export const blockRelationship = (userId: string) =>
  apiPost<{ ended: number }>(`/sentinel/people/${userId}/block`, {});
