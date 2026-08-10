export declare const SMS_SENDER: unique symbol;
export interface SmsSender {
    send(phone: string, body: string): Promise<void>;
}
