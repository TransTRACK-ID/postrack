import { watch, onMounted } from 'vue';

/**
 * Composable for managing dark/light mode
 * Defaults to dark mode (no 'light' class on html)
 * Stores preference in localStorage
 */
export const useDarkMode = () => {
  const isDarkMode = useState('darkMode', () => true);

  const applyTheme = () => {
    if (typeof window === 'undefined') return;

    if (isDarkMode.value) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  };

  const toggleDarkMode = () => {
    isDarkMode.value = !isDarkMode.value;
  };

  const initDarkMode = () => {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem('theme');
    if (stored === 'light') {
      isDarkMode.value = false;
    } else {
      // Default to dark mode
      isDarkMode.value = true;
    }
  };

  onMounted(() => {
    initDarkMode();
    applyTheme();
  });

  watch(isDarkMode, () => {
    applyTheme();
  });

  return {
    isDarkMode,
    toggleDarkMode
  };
};
