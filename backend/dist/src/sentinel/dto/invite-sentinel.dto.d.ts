import { SentinelType } from '@prisma/client';
export declare class InviteSentinelDto {
    phone: string;
    name: string;
    sentinelType?: SentinelType;
    isReference?: boolean;
}
