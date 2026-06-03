export default defineNuxtPlugin(() => {
  // Only run on client-side
  if (typeof window === 'undefined') return;

  const theme = localStorage.getItem('theme');
  if (theme === 'light') {
    document.documentElement.classList.add('light');
  }
});
