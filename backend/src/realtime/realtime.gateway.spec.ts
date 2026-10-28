import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwt: { verifyAsync: jest.Mock };
  let config: { get: jest.Mock };

  const fakeClient = () => ({
    handshake: { auth: {} as Record<string, unknown> },
    data: {} as Record<string, unknown>,
    join: jest.fn(),
    disconnect: jest.fn(),
  });

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn() };
    config = { get: jest.fn().mockReturnValue('dev-secret') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);
  });

  describe('handleConnection', () => {
    it('joins the per-user room on a valid token', async () => {
      const client = fakeClient();
      client.handshake.auth.token = 'good-token';
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'user-1' });

      await gateway.handleConnection(client as never);

      expect(jwt.verifyAsync).toHaveBeenCalledWith('good-token', {
        secret: 'dev-secret',
      });
      expect(client.data.userId).toBe('user-1');
      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects when no token is sent', async () => {
      const client = fakeClient();

      await gateway.handleConnection(client as never);

      expect(jwt.verifyAsync).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects when the token fails verification', async () => {
      const client = fakeClient();
      client.handshake.auth.token = 'bad-token';
      jwt.verifyAsync.mockRejectedValueOnce(new Error('invalid'));

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });
  });
});
