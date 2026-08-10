import { OtpSender } from './otp-sender.interface';
export declare class ConsoleOtpSenderService implements OtpSender {
    private readonly logger;
    send(phone: string, code: string): Promise<void>;
}
