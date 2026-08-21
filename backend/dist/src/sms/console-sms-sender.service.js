"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ConsoleSmsSenderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleSmsSenderService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let ConsoleSmsSenderService = ConsoleSmsSenderService_1 = class ConsoleSmsSenderService {
    config;
    logger = new common_1.Logger(ConsoleSmsSenderService_1.name);
    constructor(config) {
        this.config = config;
    }
    async send(phone, body) {
        this.logger.log(`SMS to ${phone}: ${body}`);
        const nosmsnowUrl = this.config.get('NOSMSNOW_URL');
        if (!nosmsnowUrl)
            return;
        try {
            await fetch(`${nosmsnowUrl}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: 'sms', to: phone, body }),
                signal: AbortSignal.timeout(2000),
            });
        }
        catch {
        }
    }
};
exports.ConsoleSmsSenderService = ConsoleSmsSenderService;
exports.ConsoleSmsSenderService = ConsoleSmsSenderService = ConsoleSmsSenderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ConsoleSmsSenderService);
//# sourceMappingURL=console-sms-sender.service.js.map