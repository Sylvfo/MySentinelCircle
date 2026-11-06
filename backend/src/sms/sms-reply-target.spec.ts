import { findReplyTarget } from './sms-reply-target';

describe('findReplyTarget', () => {
  const names = ['Gabriel', 'Johan'];

  it.each([
    ['Gabriel 1', 0, '1'],
    ['gab 2', 0, '2'],
    ['GABRIEL: oui', 0, 'oui'],
    ['Joh OUI', 1, 'OUI'],
    ['Johan a la gare hier', 1, 'a la gare hier'],
  ])('reads "%s"', (body, index, reply) => {
    expect(findReplyTarget(body, names)).toEqual({ index, reply });
  });

  it('ignores accents in a name', () => {
    expect(findReplyTarget('Jose 1', ['José'])).toEqual({
      index: 0,
      reply: '1',
    });
  });

  it.each(['1', 'OUI', 'non merci', 'Ga 1', 'Gabriel', 'Marie 1'])(
    'finds no target in "%s"',
    (body) => {
      expect(findReplyTarget(body, names)).toBeNull();
    },
  );

  it('finds no target when the letters fit two people', () => {
    expect(findReplyTarget('Gab 1', ['Gabriel', 'Gabrielle'])).toBeNull();
    expect(findReplyTarget('Marc 1', ['Marc', 'Marc'])).toBeNull();
  });
});
