const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const PLACEHOLDER_CLIENT_IDS = new Set([
  '',
  'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  'your-google-client-id-here',
  'your-google-client-id.apps.googleusercontent.com',
]);

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const isGoogleAuthConfigured =
  Boolean(GOOGLE_CLIENT_ID) && !PLACEHOLDER_CLIENT_IDS.has(GOOGLE_CLIENT_ID);

let googleScriptPromise;

export function loadGoogleIdentityScript() {
  if (!isGoogleAuthConfigured) {
    return Promise.reject(new Error('Google client ID is not configured.'));
  }

  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Sign-In is only available in a browser.'));
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
      const script = existingScript || document.createElement('script');

      const handleLoad = () => {
        if (window.google?.accounts?.id) {
          resolve(window.google);
        } else {
          reject(new Error('Google Identity Services loaded without the accounts API.'));
        }
      };

      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Identity Services.')),
        { once: true }
      );

      if (!existingScript) {
        script.src = GOOGLE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    });
  }

  return googleScriptPromise;
}

export async function renderGoogleButton({ element, callback, text }) {
  if (!element) {
    throw new Error('Google Sign-In button container was not found.');
  }

  const google = await loadGoogleIdentityScript();

  element.innerHTML = '';
  google.accounts.id.disableAutoSelect?.();
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback,
    auto_select: false,
  });
  google.accounts.id.renderButton(element, {
    theme: 'filled_black',
    size: 'large',
    width: 320,
    text,
    shape: 'pill',
  });
}
