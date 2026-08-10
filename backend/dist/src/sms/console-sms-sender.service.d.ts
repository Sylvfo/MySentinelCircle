import { SmsSender } from './sms-sender.interface';
export declare class ConsoleSmsSenderService implements SmsSender {
    private readonly logger;
    send(phone: string, body: string): Promise<void>;
}
