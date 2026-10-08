/**
 * Android system back-button handling (Capacitor @capacitor/app).
 *
 * Priority:
 *   1. An open modal/dialog/dropdown sheet -> close it.
 *   2. Otherwise, if we are not on the home route and the WebView has
 *      in-app history -> go back one step inside the app.
 *   3. Otherwise (home route, no internal navigation state) -> let the
 *      app exit via the normal Android behavior.
 *
 * On web/PWA the App plugin's backButton event never fires, so browser
 * back/forward keep working through the hash history untouched.
 */
import { App } from '@capacitor/app';
import { closeTopModal, hasOpenModal } from '../ui/components';
import { currentRoute, type Route } from '../ui/nav';

let initialized = false;

export type BackAction = 'close-modal' | 'go-back' | 'exit';

/**
 * Pure back-button decision, in priority order:
 * 1. modal open -> close it
 * 2. not on home + in-app history -> go back inside the app
 * 3. otherwise -> normal Android exit
 */
export function decideBackAction(
  modalOpen: boolean,
  route: Route,
  canGoBack: boolean,
): BackAction {
  if (modalOpen) return 'close-modal';
  if (route !== 'home' && canGoBack) return 'go-back';
  return 'exit';
}

export function initBackButton(): void {
  if (initialized) return;
  initialized = true;
  try {
    void App.addListener('backButton', ({ canGoBack }) => {
      const action = decideBackAction(hasOpenModal(), currentRoute(), canGoBack);
      if (action === 'close-modal') closeTopModal();
      else if (action === 'go-back') window.history.back();
      else void App.exitApp();
    });
  } catch {
    // Non-native environment or plugin unavailable: browser back handles it.
  }
}
