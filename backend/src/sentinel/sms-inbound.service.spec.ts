import { SmsInboundService } from './sms-inbound.service';
import { SentinelService } from './sentinel.service';
import { OuterCirclesService } from '../alert/outer-circles.service';
import { RetentionService } from '../privacy/retention.service';
import { WatchService } from '../watch/watch.service';

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
    languageByPhone: jest.Mock;
  };
  let alert: {
    listOpenQuestionsByPhone: jest.Mock;
    answerQuestion: jest.Mock;
  };
  let watches: { smsChecksByPhone: jest.Mock; confirmBySms: jest.Mock };
  let sms: { send: jest.Mock };
  let retention: { eraseStubIfUnused: jest.Mock };
  let service: SmsInboundService;

  beforeEach(() => {
    sentinel = {
      answerInvitation: jest.fn().mockResolvedValue({}),
      listInvitationsByPhone: jest.fn().mockResolvedValue([]),
      listActiveLinksByPhone: jest.fn().mockResolvedValue([]),
      leaveLinkBySms: jest.fn().mockResolvedValue(true),
      languageByPhone: jest.fn().mockResolvedValue(null),
    };
    alert = {
      listOpenQuestionsByPhone: jest.fn().mockResolvedValue([]),
      answerQuestion: jest.fn().mockResolvedValue(replied),
    };
    watches = {
      smsChecksByPhone: jest.fn().mockResolvedValue([]),
      confirmBySms: jest.fn(),
    };
    sms = { send: jest.fn().mockResolvedValue(undefined) };
    retention = { eraseStubIfUnused: jest.fn().mockResolvedValue(true) };
    service = new SmsInboundService(
      sentinel as unknown as SentinelService,
      alert as unknown as OuterCirclesService,
      watches as unknown as WatchService,
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
      // Each with its reply code.
      expect(sms.send.mock.calls[0][1]).toContain(
        'Gabriel : 211 Oui, 212 Plus tard, 213 Non',
      );
      expect(sms.send.mock.calls[0][1]).toContain('Johan : 111 Oui, 112 Non');
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

  describe('Watch Mode', () => {
    const trip = { id: 'trip-1', label: 'Tour du lac', alertType: 'TRAVEL' };

    it('validates a reminded step on OK and says what comes next', async () => {
      watches.smsChecksByPhone.mockResolvedValueOnce([trip]);
      watches.confirmBySms.mockResolvedValueOnce({
        mode: 'TRIP',
        next: {
          placeName: 'Col du Lac',
          expectedAt: new Date(Date.now() + 2 * 3_600_000),
        },
        timeZone: 'Europe/Zurich',
        language: 'fr',
      });

      await expect(service.handle(phone, 'ok')).resolves.toEqual({
        matched: true,
        action: 'watch_confirmed',
      });
      expect(watches.confirmBySms).toHaveBeenCalledWith(trip);
      expect(sms.send.mock.calls[0][1]).toContain(
        'Prochaine etape : "Col du Lac"',
      );
    });

    it('asks to plan the next step when none is left', async () => {
      watches.smsChecksByPhone.mockResolvedValueOnce([trip]);
      watches.confirmBySms.mockResolvedValueOnce({
        mode: 'TRIP',
        next: null,
        timeZone: 'Europe/Zurich',
        language: 'en',
      });

      await service.handle(phone, 'OK');

      expect(sms.send.mock.calls[0][1]).toContain(
        'Remember to plan your next step',
      );
    });

    it('leaves anything else than OK alone', async () => {
      watches.smsChecksByPhone.mockResolvedValueOnce([trip]);

      await service.handle(phone, 'peut-etre');

      expect(watches.confirmBySms).not.toHaveBeenCalled();
    });

    it('comes after an alert question of the same number', async () => {
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([question('Lea')]);
      watches.smsChecksByPhone.mockResolvedValueOnce([trip]);

      await service.handle(phone, 'OK');

      // Two things to answer: the person is asked which one.
      expect(watches.confirmBySms).not.toHaveBeenCalled();
      expect(sms.send.mock.calls[0][1]).toContain(
        'Tour du lac : 311 Tout va bien',
      );
    });
  });

  describe('reply codes', () => {
    it('answers exactly the question its code names', async () => {
      const first = { ...question('Gabriel'), smsSlot: 1 };
      const second = { ...question('Johan'), smsSlot: 2 };
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([first, second]);

      await service.handle(phone, '223');

      expect(alert.answerQuestion).toHaveBeenCalledWith(second, phone, '3');
    });

    it('reads a free answer after the code', async () => {
      const where = { ...question('Gabriel', null, 'WHERE_SEEN'), smsSlot: 1 };
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([where]);

      await service.handle(phone, '21 au marché');

      expect(alert.answerQuestion).toHaveBeenCalledWith(
        where,
        phone,
        'au marché',
      );
    });

    it('accepts or declines the invitation its code names', async () => {
      const johan = { ...link('Johan'), smsSlot: 1 };
      const marc = { ...link('Marc'), smsSlot: 2 };
      sentinel.listInvitationsByPhone.mockResolvedValue([johan, marc]);

      await service.handle(phone, '122');
      expect(sentinel.answerInvitation).toHaveBeenCalledWith(marc, false);

      await service.handle(phone, '111');
      expect(sentinel.answerInvitation).toHaveBeenCalledWith(johan, true);
    });

    it('confirms a Watch Mode deadline with 311', async () => {
      const trip = { id: 'trip-1', label: 'Tour du lac', alertType: 'TRAVEL' };
      watches.smsChecksByPhone.mockResolvedValueOnce([trip]);
      watches.confirmBySms.mockResolvedValueOnce({
        mode: 'TRIP',
        next: null,
        timeZone: 'Europe/Zurich',
        language: 'fr',
      });

      await service.handle(phone, '311');

      expect(watches.confirmBySms).toHaveBeenCalledWith(trip);
    });

    it('a code nothing waits for falls back to the usual reading', async () => {
      alert.listOpenQuestionsByPhone.mockResolvedValueOnce([
        question('Gabriel'),
      ]);

      await service.handle(phone, '291');

      // Not "29": the only question gets the whole text.
      expect(alert.answerQuestion).toHaveBeenCalledWith(
        expect.anything(),
        phone,
        '291',
      );
    });
  });
});
