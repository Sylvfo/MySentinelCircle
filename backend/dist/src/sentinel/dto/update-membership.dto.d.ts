import { SentinelType } from '@prisma/client';
export declare class UpdateMembershipDto {
    sentinelType?: SentinelType;
    isReference?: boolean;
    circleId?: string;
}
