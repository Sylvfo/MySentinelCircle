import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Delay between a deadline and the alert: from a few minutes (a short
// hike, or a test) to a week.
const MIN_DELAY_MINUTES = 5;
const MAX_DELAY_MINUTES = 7 * 24 * 60;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

// One step of a trip: a place, when the traveller expects to be there,
// and how long to wait without news before the 1st circle is told.
export class TripStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  placeName: string;

  @IsDateString()
  expectedAt: string;

  @IsInt()
  @Min(MIN_DELAY_MINUTES)
  @Max(MAX_DELAY_MINUTES)
  delayMinutes: number;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

// Editing a planned step: only what changes.
export class UpdateTripStepDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  placeName?: string;

  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_DELAY_MINUTES)
  @Max(MAX_DELAY_MINUTES)
  delayMinutes?: number;

  // null clears a position given earlier.
  @IsOptional()
  @IsLatitude()
  latitude?: number | null;

  @IsOptional()
  @IsLongitude()
  longitude?: number | null;
}

// The All Good Check rhythm (see check-in-schedule.ts).
export class CheckInScheduleDto {
  @IsIn(['DAILY', 'WEEKDAYS', 'EVERY'])
  kind: 'DAILY' | 'WEEKDAYS' | 'EVERY';

  @Matches(HHMM)
  before: string;

  // WEEKDAYS: 1 = Monday … 7 = Sunday.
  @ValidateIf((o: CheckInScheduleDto) => o.kind === 'WEEKDAYS')
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  days?: number[];

  @ValidateIf((o: CheckInScheduleDto) => o.kind === 'EVERY')
  @IsInt()
  @Min(1)
  @Max(52)
  every?: number;

  @ValidateIf((o: CheckInScheduleDto) => o.kind === 'EVERY')
  @IsIn(['DAY', 'WEEK', 'MONTH'])
  unit?: 'DAY' | 'WEEK' | 'MONTH';

  @ValidateIf((o: CheckInScheduleDto) => o.kind === 'EVERY')
  @Matches(YYYYMMDD)
  from?: string;
}

// What the 1st circle may see before any alert (both off by default).
// Trip: the itinerary / the validations. All Good: that it is on and its
// rhythm / the last validation.
class WatchSharingDto {
  @IsOptional()
  @IsBoolean()
  shareItineraryWithFirstCircle?: boolean;

  @IsOptional()
  @IsBoolean()
  shareValidationsWithFirstCircle?: boolean;
}

export class CreateTripDto extends WatchSharingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  // "What to do if something is wrong", shown to the 1st circle in an alert.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @ValidateNested()
  @Type(() => TripStepDto)
  firstStep: TripStepDto;

  // The other steps already known.
  @IsOptional()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TripStepDto)
  moreSteps?: TripStepDto[];

  // The trip's own circle, named after it (more can be added later).
  @IsOptional()
  @IsBoolean()
  travelCircle?: boolean;
}

export class StartAllGoodDto extends WatchSharingDto {
  @ValidateNested()
  @Type(() => CheckInScheduleDto)
  schedule: CheckInScheduleDto;

  @IsInt()
  @Min(MIN_DELAY_MINUTES)
  @Max(MAX_DELAY_MINUTES)
  delayMinutes: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}

export class UpdateWatchDto extends WatchSharingDto {
  // Trip only.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  // All Good only.
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckInScheduleDto)
  schedule?: CheckInScheduleDto;

  // The delay before the alert: a trip's every step still ahead, or the
  // next All Good deadline (and the following ones).
  @IsOptional()
  @IsInt()
  @Min(MIN_DELAY_MINUTES)
  @Max(MAX_DELAY_MINUTES)
  delayMinutes?: number;

  // All Good only: "Mettre en pause jusqu'au…"; null resumes now.
  @IsOptional()
  @IsDateString()
  pausedUntil?: string | null;
}

// ---- Travel circles ------------------------------------------------------

// "Nouveau cercle du voyage" / "Nouveau groupe de voyage" (a mutual
// group: the people travelling together watch over each other).
export class CreateTravelCircleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  group?: boolean;
}

// One of the person's Sentinels comes on the trip: they stay in their own
// circle and are counted in this travel circle for the trip only.
export class AddTravellerDto {
  @IsString()
  linkId: string;

  @IsString()
  circleId: string;
}

// End of a trip: what becomes of the people added for it. Existing
// Sentinels keep their place whatever is chosen.
// - RESERVE: into the reserve circle (the default);
// - END: the link ends;
// - KEEP: they stay in the trip's circle, which becomes a normal circle;
// - CIRCLE: into another of the person's circles (not the 1st: that one
//   needs their consent, through the usual membership move).
const END_CHOICES = ['RESERVE', 'END', 'KEEP', 'CIRCLE'] as const;
export type EndChoice = (typeof END_CHOICES)[number];

export class PersonEndChoiceDto {
  @IsString()
  linkId: string;

  @IsIn(END_CHOICES)
  choice: EndChoice;

  @ValidateIf((o: PersonEndChoiceDto) => o.choice === 'CIRCLE')
  @IsString()
  circleId?: string;
}

export class EndWatchDto {
  // "Pour les 4": everyone at once…
  @IsOptional()
  @IsIn(['RESERVE', 'END', 'KEEP'])
  forAll?: Exclude<EndChoice, 'CIRCLE'>;

  // …or "Ou pour chaque Sentinelle".
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PersonEndChoiceDto)
  perPerson?: PersonEndChoiceDto[];
}

// "Je suis là, comme prévu" / "Je suis ailleurs, mais tout va bien" — and
// for All Good, simply "Tout va bien".
export class ValidateWatchDto {
  @IsOptional()
  @IsIn(['AS_PLANNED', 'ELSEWHERE'])
  kind?: 'AS_PLANNED' | 'ELSEWHERE';

  // ELSEWHERE: where they are instead.
  @ValidateIf((o: ValidateWatchDto) => o.kind === 'ELSEWHERE')
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  place?: string;

  // Only when they chose to share their position.
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  // The logbook ("journal de bord").
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Trip, no step planned after this one: plan the next one…
  @IsOptional()
  @ValidateNested()
  @Type(() => TripStepDto)
  nextStep?: TripStepDto;

  // …or say this was the last one…
  @IsOptional()
  @IsBoolean()
  endTrip?: boolean;

  // …and what becomes of the people added for the trip (EndWatchDto).
  @IsOptional()
  @ValidateNested()
  @Type(() => EndWatchDto)
  endChoices?: EndWatchDto;
}
