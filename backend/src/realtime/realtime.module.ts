import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { REALTIME_NOTIFIER } from './realtime-notifier.interface';

// Global like SmsModule/EmailModule, so AlertModule/MessagingModule can
// inject REALTIME_NOTIFIER without importing this module themselves.
// The gateway itself provides the token (useExisting, not useClass) so
// there's a single instance serving both the Nest WS gateway and the
// injectable notifier.
@Global()
@Module({
  imports: [AuthModule],
  providers: [
    RealtimeGateway,
    { provide: REALTIME_NOTIFIER, useExisting: RealtimeGateway },
  ],
  exports: [REALTIME_NOTIFIER],
})
export class RealtimeModule {}
