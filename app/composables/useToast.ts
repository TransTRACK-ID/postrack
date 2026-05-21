/**
 * Simple toast notification composable
 * Used for showing temporary success/error messages
 * Uses useState for proper SSR scoping
 */

interface ToastOptions {
  duration?: number;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const useToast = () => {
  // Use useState for SSR-safe global state
  const toastState = useState<ToastState>('toast', () => ({
    show: false,
    message: '',
    type: 'success'
  }));

  // Timeout reference - client-only
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success', options: ToastOptions = {}) => {
    const { duration = 3000 } = options;

    // Clear existing timeout (client-only)
    if (process.client && toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }

    // Show new toast
    toastState.value = {
      show: true,
      message,
      type
    };

    // Auto dismiss (client-only)
    if (process.client) {
      toastTimeout = setTimeout(() => {
        toastState.value.show = false;
      }, duration);
    }
  };

  const hideToast = () => {
    // Clear timeout (client-only)
    if (process.client && toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
    toastState.value.show = false;
  };

  return {
    toastState: readonly(toastState),
    showToast,
    hideToast
  };
};
