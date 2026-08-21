import { ConfigService } from '@nestjs/config';
import { OtpSender } from './otp-sender.interface';
export declare class ConsoleOtpSenderService implements OtpSender {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    send(phone: string, code: string): Promise<void>;
}
