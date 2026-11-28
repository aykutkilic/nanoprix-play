// Bump the trial version when the Pera course, car physics or event rules change.
export const TRIAL_VERSION = 2; // (2: Pera goes round by the Taksim tunnel and Mete Caddesi)
export const QUICK_RACE = Object.freeze({
  mode: 'race', course: 'pera', laps: 1, reverse: false, weather: 'clear',
  light: 'day', bots: 3, level: 0, traffic: 0,
});
export const TIME_TRIAL = Object.freeze({ ...QUICK_RACE, bots: 0 });
export const TRIAL_CAR = 'spor';
export const TRIAL_SEED = 4619;

export function trialRecordKey(settings, car) {
  return ['trial', TRIAL_VERSION, settings.course, settings.reverse ? 'reverse' : 'forward', car].join('.');
}
