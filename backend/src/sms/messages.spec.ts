import {
  alertQuestionSms,
  deathNoticeSms,
  lastLeadCannotLeaveSms,
  lastLeadWantsToLeaveSms,
  parseSmsCommand,
  parseSmsReply,
  sentinelAcceptedSms,
  sentinelInfoSms,
  stopChoiceSms,
} from './messages';

describe('parseSmsCommand', () => {
  it.each(['INFO', 'info', ' Info. '])('reads "%s" as info', (body) => {
    expect(parseSmsCommand(body)).toEqual({ kind: 'info' });
  });

  it.each(['STOP', 'quitter', 'Arrêter'])('reads "%s" as stop', (body) => {
    expect(parseSmsCommand(body)).toEqual({ kind: 'stop', position: null });
  });

  it('reads the position of STOP 2', () => {
    expect(parseSmsCommand('stop 2')).toEqual({ kind: 'stop', position: 2 });
  });

  it.each(['non', '1', 'stop tout de suite', 'info sur Marc', 'bonjour'])(
    'does not treat "%s" as a command',
    (body) => {
      expect(parseSmsCommand(body)).toBeNull();
    },
  );
});

describe('parseSmsReply', () => {
  it('no longer takes STOP for a decline', () => {
    expect(parseSmsReply('STOP')).toBe('unknown');
    expect(parseSmsReply('Non.')).toBe('decline');
    expect(parseSmsReply('oui merci')).toBe('accept');
  });
});

describe('SMS length', () => {
  it.each([
    ['CAN_VISIT', alertQuestionSms('Marc Dupont', 'CAN_VISIT')],
    ['LAST_NEWS', alertQuestionSms('Marc Dupont', 'LAST_NEWS')],
    ['SEEMED_OK', alertQuestionSms('Marc Dupont', 'SEEMED_OK')],
    ['WHERE_SEEN', alertQuestionSms('Marc Dupont', 'WHERE_SEEN')],
    ['death notice', deathNoticeSms()],
    ['acceptance', sentinelAcceptedSms('Marc')],
    ['last Lead reply', lastLeadCannotLeaveSms('Marc')],
    ['last Lead warning', lastLeadWantsToLeaveSms('Lea')],
  ])('keeps %s in one SMS', (_, text) => {
    expect(text.length).toBeLessThanOrEqual(160);
  });
});

describe('sentinelInfoSms', () => {
  it('offers STOP 1 or STOP 2 with several people', () => {
    const text = sentinelInfoSms(['Marc', 'Lea'], false);

    expect(text).toContain('1 Marc\n2 Lea');
    expect(text).toContain('Pas de compte.');
    expect(text).toContain('STOP 1 ou STOP 2');
  });

  it('offers a plain STOP with one person', () => {
    expect(sentinelInfoSms(['Marc'], true)).toContain('Pour arreter : STOP.');
  });
});

describe('stopChoiceSms', () => {
  it('lists every person', () => {
    expect(stopChoiceSms(['Marc', 'Lea'])).toContain(
      'Repondez STOP 1 ou STOP 2.',
    );
  });
});

describe('alertQuestionSms — wording by gender', () => {
  it('says "la" when the gender is not set', () => {
    expect(alertQuestionSms('Marie Dupont', 'CAN_VISIT')).toContain(
      'Pouvez-vous aller la voir ?',
    );
  });

  it('says "le" for a man', () => {
    expect(
      alertQuestionSms('Paul Dupont', 'CAN_VISIT', {
        firstName: 'Paul',
        gender: 'MALE',
      }),
    ).toContain('Pouvez-vous aller le voir ?');
  });

  it('uses the first name for neutral', () => {
    expect(
      alertQuestionSms('Alex Dupont', 'WHERE_SEEN', {
        firstName: 'Alex',
        gender: 'NEUTRAL',
      }),
    ).toContain('Ou avez-vous vu Alex pour la derniere fois ?');
  });

  it('keeps the default for a question without variants', () => {
    expect(
      alertQuestionSms('Paul Dupont', 'LAST_NEWS', {
        firstName: 'Paul',
        gender: 'MALE',
      }),
    ).toContain('Ses dernieres nouvelles ?');
  });
});
