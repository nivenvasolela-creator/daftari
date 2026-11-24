// The consent message the founder sends each trader on WhatsApp before the test.
// Bump CONSENT_VERSION whenever the text changes; each trader records the version they accepted.
export const CONSENT_VERSION = '2026-11-24.1';
export const CONSENT_PURPOSE = 'Daftari 2-week test: record sales, expenses and debts from messages and send a daily summary';

export function consentMessage(traderName: string, contact: string): string {
  const first = traderName.split(' ')[0] || '';
  return [
    `Habari ${first}! Karibu kwenye majaribio ya Daftari kwa wiki 2, bure.`,
    '',
    'Kila unapouza, kutumia pesa au mtu akichukua kwa mkopo, nitumie voice note au ujumbe hapa. Kila jioni nitakutumia hesabu yako: mauzo, matumizi, faida na wanaodaiwa na wewe.',
    '',
    'Kuhusu taarifa zako:',
    '- Nitahifadhi rekodi za mauzo, matumizi na madeni tu (pamoja na majina ya wanaokudai). Voice notes hazihifadhiwi baada ya kusomwa.',
    '- Ujumbe wako unasomwa na huduma ya AI ya Google (Gemini), iliyo nje ya Tanzania. Google inaweza kutumia ujumbe huo kuboresha huduma zake.',
    '- Sitashiriki taarifa zako na mtu mwingine yeyote, wala benki.',
    '- Unaweza kuomba nakala ya rekodi zako, au nizifute zote, wakati wowote.',
    contact ? `- Maswali: ${contact}` : '',
    '',
    'Ukikubali, jibu: NAKUBALI',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');
}
