import { SmsInboundService } from './sms-inbound.service';
import { SentinelService } from './sentinel.service';
import { OuterCirclesService } from '../alert/outer-circles.service';
import { RetentionService } from '../privacy/retention.service';

const link = (firstName: string, userType = 'ONLY_SMS') => ({
  userCompanion: { firstName },
  linkAsSentinel: { userType, phone: '+33611111111' },
});

const question = (
  firstName: string,
  response: string | null = null,
  kind = 'CAN_VISIT',
) => ({
  kind,
  response,
  alertParticipant: { alert: { userCompanion: { firstName } } },
});

describe('SmsInboundService', () => {
  const phone = '+33611111111';
  const replied = { matched: true, action: 'alert_replied' };
  let sentinel: {
    answerInvitation: jest.Mock;
    listInvitationsByPhone: jest.Mock;
    listActiveLinksByPhone: jest.Mock;
    leaveLinkBySms: jest.Mock;
  };
  let alert: {
    listOpenQuestionsByPhone: jest.Mock;
    answerQuestion: jest.Mock;
  };
  let sms: { send: jest.Mock };
  let retention: { eraseStubIfUnused: jest.Mock };
  let service: SmsInboundService;

  beforeEach(() => {
    sentinel = {
      answerInvitation: jest.fn().mockResolvedValue({}),
      listInvitationsByPhone: jest.fn().mockResolvedValue([]),
      listActiveLinksByPhone: jest.fn().mockResolvedValue([]),
      leaveLinkBySms: jest.fn().mockResolvedValue(true),
    };
    alert = {
      listOpenQuestionsByPhone: jest.fn().mockResolvedValue([]),
      answerQuestion: jest.fn().mockResolvedValue(replied),
    };
    sms = { send: jest.fn().mockResolvedValue(undefined) };
    retention = { eraseStubIfUnused: jest.fn().mockResolvedValue(true) };
    service = new SmsInboundService(
      sentinel as unknown as SentinelService,
      alert as unknown as OuterCirclesService,
      retention as unknown as RetentionService,
      sms,
    );
  });

  describe('commands', () => {
    it('answers INFO with the people followed, even during an alert', async () => {
      sentinel.listActiveLinksByPhone.mockResolvedValueOnce([
        link('Marc'),
        link('Lea'),
      ]);

      await expect(service.handle(phone, 'INFO')).resolves.toEqual({
        matched: true,
        action: 'info_sent',
      });
      expect(alert.listOpenQuestionsByPhone).not.toHaveBeenCalled();
      expect(sms.send.mock.calls[0][1]).toContain('1 Marc\n2 Lea');
    });

    it('says nothing to INFO from an unknown number', async () => {
      await service.handle(phone, 'INFO');

      expect(sms.send).not.toHaveBeenCalled();
    });

    it('removes the only person on STOP', async () => {
      const only = link('Marc');
      sentinel.listActiveLinksByPhone.mockResolvedValueOnce([only]);

      await expect(service.handle(phone, 'STOP')).resolves.toEqual({
        matched: true,
        action: 'left',
      });
      expect(sentinel.leaveLinkBySms).toHaveBeenCalledWith(only);
      expect(retention.eraseStubIfUnused).toHaveBeenCalledWith(phone);
    });

    it('reports a last Lead kept in place', async () => {
      sentinel.listActiveLinksByPhone.mockResolvedValueOnce([link('Marc')]);
      sentinel.leaveLinkBySms.mockResolvedValueOnce(false);

      await expect(service.handle(phone, 'STOP')).resolves.toEqual({
        matched: true,
        action: 'last_lead_kept',
      });
      expect(retention.eraseStubIfUnused).not.toHaveBeenCalled();
    });

    it('asks who on STOP with several people, removing nobody', async () => {
      sentinel.listActiveLinksByPhone.mockResolvedValueOnce([
        link('Marc'),
        link('Lea'),
      ]);

      await expect(service.handle(phone, 'STOP')).resolves.toEqual({
        matched: true,
        action: 'stop_choice_sent',
      });
      expect(sentinel.leaveLinkBySms).not.toHaveBeenCalled();
    });

    it('removes the chosen person on STOP 2', async () => {
      const second = link('Lea');
      sentinel.listActiveLinksByPhone.mockResolvedValueOnce([
        link('Marc'),
        second,
      ]);

      await service.handle(phone, 'STOP 2');

      expect(sentinel.leaveLinkBySms).toHaveBeenCalledWith(second);
    });

    it('asks again when the number of STOP is outside the list', async () => {
      sentinel.listActiveLinksByPhone.mockResolvedValueOnce([link('Marc')]);

      await service.handle(phone, 'STOP 5');

      expect(sentinel.leaveLinkBySms).not.toHaveBeenCalled();
      expect(sms.send).toHaveBeenCalledTimes(1);
    });

    it('declines a pending invitation on STOP when nobody is followed', async () => {
      const invitation = link('Marc');
      sentinel.listInvitationsByPhone.mockResolvedValueOnce([invitation]);

      await expect(service.handle(phone, 'STOP')).resolves.toEqual({
        matched: true,
        action: 'declined',
      });
      expect(sentinel.answerInvitation).toHaveBeenCalledWith(invitation, false);
      expect(retention.eraseStubIfUnused).toHaveBeenCalledWith(phone);
    });
  });

  describe('one request', () => {
    it('answers the only alert question', async () => {
      const only = question('Gabriel');
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([only]);

      await expect(service.handle(phone, '1')).resolves.toEqual(replied);
      expect(alert.answerQuestion).toHaveBeenCalledWith(only, phone, '1');
    });

    it('answers the only invitation', async () => {
      const invitation = link('Marc');
      sentinel.listInvitationsByPhone.mockResolvedValueOnce([invitation]);

      await expect(service.handle(phone, 'OUI')).resolves.toEqual({
        matched: true,
        action: 'accepted',
      });
      expect(sentinel.answerInvitation).toHaveBeenCalledWith(invitation, true);
    });

    it('lets someone change their latest answer', async () => {
      const answered = question('Gabriel', 'YES');
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([
        answered,
        question('Johan', 'NO'),
      ]);

      await service.handle(phone, '3');

      expect(alert.answerQuestion).toHaveBeenCalledWith(answered, phone, '3');
    });

    it('never removes anyone on NON', async () => {
      sentinel.listActiveLinksByPhone.mockResolvedValue([link('Marc')]);

      await service.handle(phone, 'NON');

      expect(sentinel.leaveLinkBySms).not.toHaveBeenCalled();
    });
  });

  describe('several requests', () => {
    it('records nothing without a name, and says how to answer', async () => {
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([
        question('Gabriel'),
      ]);
      sentinel.listInvitationsByPhone.mockResolvedValueOnce([link('Johan')]);

      await expect(service.handle(phone, 'OUI')).resolves.toEqual({
        matched: true,
        action: 'several_requests',
      });
      expect(alert.answerQuestion).not.toHaveBeenCalled();
      expect(sentinel.answerInvitation).not.toHaveBeenCalled();
      expect(sms.send.mock.calls[0][1]).toContain('Gabriel 1 ou Johan OUI');
    });

    it('answers the alert question named in the reply', async () => {
      const gabriel = question('Gabriel');
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([
        question('Johan'),
        gabriel,
      ]);

      await service.handle(phone, 'Gab 2');

      expect(alert.answerQuestion).toHaveBeenCalledWith(gabriel, phone, '2');
    });

    it('answers the invitation named in the reply', async () => {
      const invitation = link('Johan');
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([
        question('Gabriel'),
      ]);
      sentinel.listInvitationsByPhone.mockResolvedValueOnce([invitation]);

      await service.handle(phone, 'Johan NON');

      expect(sentinel.answerInvitation).toHaveBeenCalledWith(invitation, false);
      expect(alert.answerQuestion).not.toHaveBeenCalled();
    });

    it('records nothing when two people have the same first name', async () => {
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([
        question('Marc'),
        question('Marc'),
      ]);

      await expect(service.handle(phone, 'Marc 1')).resolves.toEqual({
        matched: true,
        action: 'several_requests',
      });
      expect(alert.answerQuestion).not.toHaveBeenCalled();
    });

    it('can change an answer by naming the person', async () => {
      const answered = question('Gabriel', 'YES');
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([
        question('Johan'),
        answered,
      ]);

      await service.handle(phone, 'Gabriel 3');

      expect(alert.answerQuestion).toHaveBeenCalledWith(answered, phone, '3');
    });
  });

  describe('messages not understood', () => {
    it('sends nothing to an unknown number', async () => {
      await expect(service.handle(phone, 'bonjour')).resolves.toEqual({
        matched: false,
        reason: 'no_actionable_link',
      });
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('helps a known Sentinel once per day', async () => {
      sentinel.listActiveLinksByPhone.mockResolvedValue([link('Marc')]);

      await service.handle(phone, 'bonjour');
      await service.handle(phone, 'encore');

      expect(sms.send).toHaveBeenCalledTimes(1);
    });
  });
});
