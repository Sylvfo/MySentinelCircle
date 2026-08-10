import { SentinelService } from './sentinel.service';
import { InboundSmsDto } from './dto/inbound-sms.dto';
export declare class SentinelSmsController {
    private readonly sentinel;
    constructor(sentinel: SentinelService);
    inbound(dto: InboundSmsDto): Promise<{
        matched: false;
        reason: string;
        action?: undefined;
    } | {
        matched: true;
        action: string;
        reason?: undefined;
    }>;
}
