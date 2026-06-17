/**
 * Optimized Drag State Composable
 *
 * Provides application-wide drag-and-drop state using shallowRef to minimize
 * reactive overhead. Only triggers re-renders when target identity changes.
 *
 * Since drag-and-drop is a global interaction (only one at a time),
 * this uses a shared singleton state pattern.
 */
import { shallowRef, readonly as vueReadonly } from 'vue';

export interface DropTarget {
  type: 'folder' | 'request' | 'collection' | 'between' | 'project';
  id: string;
  position: 'before' | 'after' | 'inside';
}

// ---------------------------------------------------------------------------
// Shared singleton state (drag is inherently global — only one at a time)
// ---------------------------------------------------------------------------
const _draggingFolderId = shallowRef<string | null>(null);
const _draggingRequestId = shallowRef<string | null>(null);
const _draggingProjectId = shallowRef<string | null>(null);
const _dropTarget = shallowRef<DropTarget | null>(null);

// Plain variables for transient timing (no reactive overhead)
let _lastDragOverTime = 0;
let _throttleMs = 250;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function useDragState() {
  return {
    // Read-only reactive state
    draggingFolderId: vueReadonly(_draggingFolderId),
    draggingRequestId: vueReadonly(_draggingRequestId),
    draggingProjectId: vueReadonly(_draggingProjectId),
    dropTarget: vueReadonly(_dropTarget),

    // Direct refs for internal mutation (needed by AppSidebar handlers)
    __draggingFolderId: _draggingFolderId,
    __draggingRequestId: _draggingRequestId,
    __draggingProjectId: _draggingProjectId,
    __dropTarget: _dropTarget,

    // Actions
    setDragging,
    clearDragging,
    setDropTarget,
    shouldProcessDragOver,
    setThrottle,
  };
}

/** Set what is being dragged */
function setDragging(type: 'folder' | 'request' | 'project', id: string | null) {
  if (type === 'folder') {
    _draggingFolderId.value = id;
    _draggingRequestId.value = null;
    _draggingProjectId.value = null;
  } else if (type === 'request') {
    _draggingRequestId.value = id;
    _draggingFolderId.value = null;
    _draggingProjectId.value = null;
  } else {
    _draggingProjectId.value = id;
    _draggingFolderId.value = null;
    _draggingRequestId.value = null;
  }
  _lastDragOverTime = 0;
}

/** Clear all drag state */
function clearDragging() {
  _draggingFolderId.value = null;
  _draggingRequestId.value = null;
  _draggingProjectId.value = null;
  _dropTarget.value = null;
  _lastDragOverTime = 0;
}

/**
 * Set drop target only if it has actually changed.
 * Returns true if an update occurred.
 */
function setDropTarget(target: DropTarget | null): boolean {
  const current = _dropTarget.value;
  if (!target && !current) return false;
  if (!target || !current) {
    _dropTarget.value = target;
    return true;
  }
  if (
    current.type === target.type &&
    current.id === target.id &&
    current.position === target.position
  ) {
    return false;
  }
  _dropTarget.value = target;
  return true;
}

/** Throttle check using a plain variable (zero reactive overhead) */
function shouldProcessDragOver(throttleMs?: number): boolean {
  const ms = throttleMs ?? _throttleMs;
  const now = Date.now();
  if (now - _lastDragOverTime < ms) {
    return false;
  }
  _lastDragOverTime = now;
  return true;
}

/** Adjust global throttle */
function setThrottle(ms: number) {
  _throttleMs = ms;
}
