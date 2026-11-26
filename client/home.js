import { t } from './i18n.js';
import { fmt } from './format.js';
import { readBest } from './activities.js';

export const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(`nanoprix.${k}`); localStorage.setItem(`nanoprix.${k}`, v); } catch { /* */ } return null; };

export const action = (id, label, main = false) => `<button data-do="${id}" ${main ? 'class="main"' : ''}>${t(label)}</button>`;

export function homeHtml() {
  const best = readBest(store);
  return `<div class="panel"><h1>NANO<span>PRIX</span><small>${t('tagline')}</small></h1>
    <div class="col home-actions">
      ${action('quick', 'quick', true)}
      <div class="row">${action('solo', 'custom')}${action('trial', 'trial')}</div>
      ${best ? `<small>${t('personal')} · Pera · ${fmt(best)}</small>` : ''}
      <div class="row">${action('free', 'cruise')}${action('journal', 'journal')}</div>
      ${action('garage', 'garage')}
      <div class="row">${action('directory', 'publicRooms')}${action('create', 'create')}</div>
      <div class="row"><input type="text" id="code" class="grow" style="width:auto;text-transform:uppercase" placeholder="${t('code')}" maxlength="4" autocomplete="off">${action('join', 'join')}</div>
    </div><div class="fine">${t('credits')}</div></div>`;
}
