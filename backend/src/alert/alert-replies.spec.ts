import {
  ALERT_QUESTION_KINDS,
  MAX_ALERT_REPLY_LENGTH,
  parseAlertReply,
  parseAppReply,
  repliesFor,
} from './alert-replies';

describe('parseAlertReply', () => {
  it.each([
    ['CAN_VISIT', '1', 'YES'],
    ['CAN_VISIT', '2', 'LATER'],
    ['CAN_VISIT', '3', 'NO'],
    ['LAST_NEWS', '1', 'TODAY'],
    ['LAST_NEWS', '2', 'THIS_WEEK'],
    ['LAST_NEWS', '3', 'LONGER'],
    ['SEEMED_OK', '1', 'YES'],
    ['SEEMED_OK', '2', 'NO'],
    ['SEEMED_OK', '3', 'DONT_KNOW'],
  ] as const)('reads %s digit %s as %s', (kind, body, code) => {
    expect(parseAlertReply(body, kind)).toBe(code);
  });

  it.each([
    ['CAN_VISIT', 'OUI', 'YES'],
    ['CAN_VISIT', 'Oui !', 'YES'],
    ['CAN_VISIT', 'plus tard', 'LATER'],
    ['CAN_VISIT', 'PLUS TARD ce soir', 'LATER'],
    ['CAN_VISIT', 'non', 'NO'],
    ['LAST_NEWS', "Aujourd'hui", 'TODAY'],
    ['SEEMED_OK', 'je ne sais pas', 'DONT_KNOW'],
  ] as const)('reads %s word "%s" as %s', (kind, body, code) => {
    expect(parseAlertReply(body, kind)).toBe(code);
  });

  it('rejects a digit outside the list and unknown text', () => {
    expect(parseAlertReply('4', 'CAN_VISIT')).toBeNull();
    expect(parseAlertReply('peut-etre', 'CAN_VISIT')).toBeNull();
  });

  it('does not take a word starting like a keyword for that keyword', () => {
    expect(parseAlertReply('nonante', 'CAN_VISIT')).toBeNull();
  });

  it('keeps the free text of WHERE_SEEN as written', () => {
    expect(parseAlertReply(' à la gare, hier ', 'WHERE_SEEN')).toBe(
      'à la gare, hier',
    );
  });

  it('limits a free text and refuses an empty one', () => {
    const long = 'a'.repeat(MAX_ALERT_REPLY_LENGTH + 10);

    expect(parseAlertReply(long, 'WHERE_SEEN')).toHaveLength(
      MAX_ALERT_REPLY_LENGTH,
    );
    expect(parseAlertReply('   ', 'WHERE_SEEN')).toBeNull();
  });
});

describe('parseAppReply', () => {
  it('accepts a code of the question only', () => {
    expect(parseAppReply('LATER', 'CAN_VISIT')).toBe('LATER');
    expect(parseAppReply('TODAY', 'CAN_VISIT')).toBeNull();
  });

  it('uses the 1st-circle list without a question', () => {
    expect(parseAppReply('GOING', null)).toBe('GOING');
    expect(parseAppReply('YES', null)).toBeNull();
  });

  it('keeps a free text for WHERE_SEEN', () => {
    expect(parseAppReply('la gare', 'WHERE_SEEN')).toBe('la gare');
  });
});

describe('repliesFor', () => {
  it('gives three numbered choices to every question but the free one', () => {
    for (const kind of ALERT_QUESTION_KINDS) {
      expect(repliesFor(kind)).toHaveLength(kind === 'WHERE_SEEN' ? 0 : 3);
    }
  });
});
