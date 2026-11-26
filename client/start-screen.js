// Home can accept a selection while the renderer and city data are arriving.
import { homeHtml } from './home.js';
import { t, lang, setLang } from './i18n.js';
import { loadAssets } from './assets.js';

const ui = document.querySelector('#ui');
const map = document.querySelector('#startup-map');
const listeners = new Set();
let choice = null;
let loading;
let code = '';
setLang(lang());
ui.innerHTML = homeHtml();
performance.mark('nanoprix-home');

export const reportStage = stage => loading.stage(stage);
export const pendingChoice = () => choice;
export function onChoice(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function select(action) {
  code = ui.querySelector('#code')?.value || '';
  if (action === 'join' && !/^[a-z]{4}$/i.test(code)) return;
  choice = { action };
  map.classList.add('pending');
  ui.innerHTML = loading ? '' : `<div class="panel center" role="status">${t('loading')}</div>`;
  for (const notify of listeners) notify();
}
const early = new AbortController();
ui.addEventListener('click', event => {
  const action = event.target.closest('[data-do]')?.dataset.do;
  if (action) select(action);
}, { signal: early.signal });
ui.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.id === 'code') select('join');
}, { signal: early.signal });

export function finishStartup() {
  early.abort();
  const active = document.activeElement;
  const focus = active.id === 'code' ? '#code' : active.dataset?.do ? `[data-do="${active.dataset.do}"]` : null;
  code = ui.querySelector('#code')?.value ?? code;
  loading.done();
  loading = null;
  map.remove();
  return { action: choice?.action, code, focus };
}

// Yield a paint before world construction. Fetch core data alongside the engine modules.
export const firstPaint = new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
export const assetsReady = firstPaint.then(async () => {
  const { Loading } = await import('./loading.js');
  if (!map.isConnected) throw new Error('Startup was interrupted');
  const progress = new Loading(map);
  if (choice) ui.innerHTML = '';
  loading = progress;
  const assets = await loadAssets((file, count) => progress.bytes(file, count));
  assets.stream.deferDelivery();
  return assets;
});
export function failStartup(error) {
  early.abort();
  listeners.clear();
  loading?.done();
  loading = null;
  map.remove();
  ui.innerHTML = `<div class="panel center"><p role="alert">${t('startupError')}</p><button class="main">${t('retryLoad')}</button></div>`;
  ui.querySelector('button').onclick = () => location.reload();
  console.error(error);
}
