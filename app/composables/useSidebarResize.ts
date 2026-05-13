import { ref, onMounted, onUnmounted, type Ref } from 'vue';

interface SidebarResizeOptions {
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

interface SidebarResizeReturn {
  width: Ref<number>;
  isCollapsed: Ref<boolean>;
  isResizing: Ref<boolean>;
  startResize: (e: MouseEvent) => void;
  toggleCollapse: () => void;
}

export function useSidebarResize(options: SidebarResizeOptions = {}): SidebarResizeReturn {
  const {
    storageKey = 'sidebarWidth',
    defaultWidth = 280,
    minWidth = 200,
    maxWidth = 500
  } = options;

  const width = ref(defaultWidth);
  const isCollapsed = ref(false);
  const isResizing = ref(false);
  const collapsedKey = `${storageKey}_collapsed`;

  onMounted(() => {
    if (typeof window === 'undefined') return;
    
    const savedWidth = localStorage.getItem(storageKey);
    if (savedWidth) {
      const parsed = parseInt(savedWidth, 10);
      if (!isNaN(parsed)) {
        width.value = Math.max(minWidth, Math.min(maxWidth, parsed));
      }
    }

    const savedCollapsed = localStorage.getItem(collapsedKey);
    if (savedCollapsed !== null) {
      isCollapsed.value = savedCollapsed === 'true';
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
  });

  onUnmounted(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
  });

  function startResize(e: MouseEvent) {
    if (isCollapsed.value) return;
    isResizing.value = true;
    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing.value) return;
    const newWidth = Math.max(minWidth, Math.min(maxWidth, e.clientX));
    width.value = newWidth;
  }

  function stopResize() {
    if (!isResizing.value) return;
    isResizing.value = false;
    localStorage.setItem(storageKey, String(width.value));
  }

  function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value;
    localStorage.setItem(collapsedKey, String(isCollapsed.value));
  }

  return {
    width,
    isCollapsed,
    isResizing,
    startResize,
    toggleCollapse
  };
}
