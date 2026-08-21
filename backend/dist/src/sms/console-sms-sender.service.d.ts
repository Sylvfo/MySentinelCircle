import { ConfigService } from '@nestjs/config';
import { SmsSender } from './sms-sender.interface';
export declare class ConsoleSmsSenderService implements SmsSender {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    send(phone: string, body: string): Promise<void>;
}
