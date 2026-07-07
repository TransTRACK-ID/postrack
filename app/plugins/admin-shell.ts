/**
 * Initialize admin shell at app scope so useFetch data survives admin layout unmount.
 */
export default defineNuxtPlugin(() => {
  useAdminShell();
});
