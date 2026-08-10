export declare const OTP_SENDER: unique symbol;
export interface OtpSender {
    send(phone: string, code: string): Promise<void>;
}
