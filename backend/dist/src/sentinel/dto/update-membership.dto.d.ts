import { SentinelType } from '@prisma/client';
export declare class UpdateMembershipDto {
    sentinelType?: SentinelType;
    requestedAsLead?: boolean;
    circleId?: string;
}
