import { assetsReady, firstPaint, failStartup } from './start-screen.js';

Promise.all([assetsReady, firstPaint.then(() => import('./main.js'))]).catch(failStartup);
