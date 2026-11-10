import { apiGet, apiGetShared, apiPatch, apiPost } from './client';
import type { AlertStatus, AlertType } from './alert';

// Watch Mode: a trip (an itinerary of steps) or an All Good Check (a
// regular "all is well"). Backend: backend/src/watch/.

export type WatchMode = 'TRIP' | 'ALL_GOOD';
// Why nothing happens at the deadlines right now.
export type PauseReason = 'SUBSCRIPTION' | 'MANUAL' | 'TRIP';

export type CheckInSchedule =
  | { kind: 'DAILY'; before: string }
  | { kind: 'WEEKDAYS'; days: number[]; before: string }
  | { kind: 'EVERY'; every: number; unit: 'DAY' | 'WEEK' | 'MONTH'; from: string; before: string };

export interface Checkpoint {
  id: string;
  expectedAt: string;
  // expectedAt + the delay chosen: the 1st circle is told then.
  alertAt: string;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  remindedAt: string | null;
  validatedAt: string | null;
  validatedLatitude: number | null;
  validatedLongitude: number | null;
  // "Somewhere else, all is well": where.
  validatedPlace: string | null;
  // The logbook.
  validatedNote: string | null;
  missedAt: string | null;
  openedAlertId: string | null;
}

export interface TravelPerson {
  id: string;
  firstName: string;
  lastName: string | null;
  avatarPath: string | null;
}

export interface TravelCircle {
  id: string;
  label: string;
  isGroup: boolean;
  status: 'ACTIVE' | 'CLOSED';
  // Invited for the trip.
  addedForTrip: { linkId: string; status: 'PENDING' | 'ACCEPTED'; person: TravelPerson }[];
  // Already Sentinels: they keep their own circle.
  alreadySentinels: { participantId: string; linkId: string; person: TravelPerson }[];
}

export interface Watch {
  id: string;
  mode: WatchMode;
  alertType: AlertType;
  // Trip name / "Check tout va bien".
  label: string;
  // "What to do if something is wrong".
  messageAlert: string;
  createdAt: string;
  closedAt: string | null;
  pausedUntil: string | null;
  shareItineraryWithFirstCircle: boolean;
  shareValidationsWithFirstCircle: boolean;
  schedule: CheckInSchedule | null;
  pausedBecause: PauseReason | null;
  checkpoints: Checkpoint[];
  currentCheckpointId: string | null;
  runningAlertIds: string[];
  travelCircles: TravelCircle[];
}

// What someone else may see of a watch (travel circle, or 1st circle when
// shared).
export interface WatchView {
  watchId: string;
  companionId: string;
  mode: WatchMode;
  role: 'TRAVEL_CIRCLE' | 'FIRST_CIRCLE';
  label: string;
  currentPlace: string | null;
  steps: {
    id: string;
    placeName: string | null;
    expectedAt: string;
    validatedAt: string | null;
    validatedPlace: string | null;
  }[];
  schedule: CheckInSchedule | null;
  nextDeadline: string | null;
  lastValidatedAt: string | null;
}

export interface WatchHistory {
  mine: {
    id: string;
    label: string;
    mode: WatchMode;
    alertType: AlertType;
    createdAt: string;
    closedAt: string | null;
    tripAlerts: {
      id: string;
      label: string;
      alertType: AlertType;
      alertStatus: AlertStatus;
      launchedAt: string | null;
      closedAt: string | null;
    }[];
  }[];
  withOthers: {
    id: string;
    label: string;
    createdAt: string;
    closedAt: string | null;
    userCompanion: { id: string; firstName: string; lastName: string | null };
  }[];
}

export interface TripStepInput {
  placeName: string;
  expectedAt: string;
  delayMinutes: number;
  latitude?: number;
  longitude?: number;
}

export interface SharingInput {
  shareItineraryWithFirstCircle?: boolean;
  shareValidationsWithFirstCircle?: boolean;
}

export type EndChoice = 'RESERVE' | 'END' | 'KEEP' | 'CIRCLE';
export interface EndChoices {
  forAll?: Exclude<EndChoice, 'CIRCLE'>;
  perPerson?: { linkId: string; choice: EndChoice; circleId?: string }[];
}

export interface ValidateInput {
  kind?: 'AS_PLANNED' | 'ELSEWHERE';
  place?: string;
  latitude?: number;
  longitude?: number;
  note?: string;
  nextStep?: TripStepInput;
  endTrip?: boolean;
  endChoices?: EndChoices;
}

// Shared between pages for a few seconds: the dashboard and the alert pages
// both load it.
export const listMyWatches = () => apiGetShared<Watch[]>('/alert/watch/mine');
export const getWatch = (id: string) => apiGet<Watch>(`/alert/watch/${id}/details`);
export const watchHistory = () => apiGet<WatchHistory>('/alert/watch/history');
export const watchesOf = (companionId: string) => apiGet<WatchView[]>(`/alert/watch/of/${companionId}`);

export const createTrip = (
  dto: {
    name: string;
    instructions?: string;
    firstStep: TripStepInput;
    moreSteps?: TripStepInput[];
    // The trip's own circle, named after it.
    travelCircle?: boolean;
  } & SharingInput,
) =>
  apiPost<Watch>('/alert/watch/trip', dto);
export const startAllGood = (
  dto: { schedule: CheckInSchedule; delayMinutes: number; instructions?: string } & SharingInput,
) => apiPost<Watch>('/alert/watch/all-good', dto);

export const updateWatch = (
  id: string,
  dto: {
    name?: string;
    instructions?: string;
    schedule?: CheckInSchedule;
    delayMinutes?: number;
    pausedUntil?: string | null;
  } & SharingInput,
) => apiPatch<Watch>(`/alert/watch/${id}/settings`, dto);

export const endWatch = (id: string, choices: EndChoices = {}) => apiPost<Watch>(`/alert/watch/${id}/end`, choices);

export const addStep = (id: string, step: TripStepInput) => apiPost<Watch>(`/alert/watch/${id}/steps`, step);
export const updateStep = (
  id: string,
  stepId: string,
  dto: Omit<Partial<TripStepInput>, 'latitude' | 'longitude'> & { latitude?: number | null; longitude?: number | null },
) => apiPatch<Watch>(`/alert/watch/${id}/steps/${stepId}`, dto);

export const validateWatch = (id: string, dto: ValidateInput) => apiPost<Watch>(`/alert/watch/${id}/validate`, dto);

export const createTravelCircle = (id: string, dto: { label?: string; group?: boolean }) =>
  apiPost<Watch>(`/alert/watch/${id}/circles`, dto);
export const addTraveller = (id: string, dto: { linkId: string; circleId: string }) =>
  apiPost<Watch>(`/alert/watch/${id}/travellers`, dto);
export const removeTraveller = (id: string, participantId: string) =>
  apiPost<Watch>(`/alert/watch/${id}/travellers/${participantId}/remove`, {});

// ---- Small helpers shared by the pages ------------------------------------

export const minutesBetween = (from: string, to: string) =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);

// The deadline the person is asked about now (see backend currentCheckpoint).
export function currentCheckpoint(watch: Watch): Checkpoint | null {
  return watch.checkpoints.find((c) => c.id === watch.currentCheckpointId) ?? null;
}

// Neither validated nor missed, after the current one.
export function stepsAhead(watch: Watch): Checkpoint[] {
  return watch.checkpoints.filter((c) => !c.validatedAt && !c.missedAt && c.id !== watch.currentCheckpointId);
}

// "Delay before the alert" choices, in minutes: 1 h, 2 h, 6 h, 1 day,
// 2 days, 5 days.
export const TRIP_DELAYS = [60, 120, 360, 1440, 2880, 7200];
export const ALL_GOOD_DELAYS = [60, 240, 720, 1440, 2880, 10080];
