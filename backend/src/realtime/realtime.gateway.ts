import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RealtimeNotifier } from './realtime-notifier.interface';

// Push-only gateway: no @SubscribeMessage handlers, clients never send
// app data over the socket, they just get told "go refetch" and call the
// existing REST endpoints. Auth mirrors JwtStrategy (same secret, same
// { sub: userId } payload) since the socket.io handshake doesn't go
// through Nest's HTTP guard pipeline.
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class RealtimeGateway
  implements RealtimeNotifier, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      (client.data as { userId: string }).userId = payload.sub;
      await client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect() {
    // socket.io drops room membership on its own — nothing to clean up.
  }

  notifyNewMessage(userId: string, conversationId: string): void {
    this.server.to(`user:${userId}`).emit('message:new', { conversationId });
  }

  notifyAlertChanged(userId: string, alertId: string): void {
    this.server.to(`user:${userId}`).emit('alert:changed', { alertId });
  }
}
