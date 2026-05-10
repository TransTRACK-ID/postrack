const STORAGE_KEY = 'postrack-login-theme';

export function useLoginTheme() {
  const lightMode = ref(false);

  const applyClass = () => {
    if (import.meta.client) {
      const html = document.documentElement;
      if (lightMode.value) {
        html.classList.add('login-light');
      } else {
        html.classList.remove('login-light');
      }
    }
  };

  const init = () => {
    if (import.meta.client) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        lightMode.value = saved === 'light';
      } else {
        lightMode.value = window.matchMedia('(prefers-color-scheme: light)').matches;
      }
      applyClass();
    }
  };

  const toggle = () => {
    lightMode.value = !lightMode.value;
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, lightMode.value ? 'light' : 'dark');
    }
    applyClass();
  };

  return {
    lightMode,
    init,
    toggle
  };
}
