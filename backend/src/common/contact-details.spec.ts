import { containsContactDetails } from './contact-details';

describe('containsContactDetails', () => {
  it.each([
    'Appelle-moi au 079 123 45 67',
    'mon numéro: 0791234567',
    'Tel +41 79 123 45 67',
    '+41791234567',
    '0041 79 123 45 67',
    '06 12 34 56 78',
    '06.12.34.56.78',
    '079-123-45-67',
    '+33 6 12 34 56 78',
    'écris-moi à lea.martin@example.ch',
    'LEA@GMAIL.COM',
  ])('spots "%s"', (text) => {
    expect(containsContactDetails(text)).toBe(true);
  });

  it.each([
    'On se retrouve le 09.11.2026 à 14:30',
    'rendez-vous 9/11/26 14h',
    'Elle a été vue vers 21:45 près de la gare',
    'Il manque 1 000 000 de choses',
    'Bus 79, arrêt 12',
    'Code postal 1201 Genève',
    'Je suis à 300 m',
    "J'arrive dans 10 min",
    'On a appelé le @lea de la chorale',
  ])('lets "%s" through', (text) => {
    expect(containsContactDetails(text)).toBe(false);
  });
});
