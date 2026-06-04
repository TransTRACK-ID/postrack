<template>
  <div v-if="updateState !== 'idle'" class="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
    <div class="bg-surface-elevated border border-border-subtle rounded-lg shadow-lg overflow-hidden">
      <!-- Update Available -->
      <div v-if="updateState === 'available'" class="flex items-center justify-between p-3">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-info/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-text-primary">Update v{{ updateVersion }} available</p>
            <p class="text-xs text-text-secondary">A new version of Postrack is ready to download</p>
          </div>
        </div>
        <div class="flex items-center gap-2 ml-3">
          <button
            @click="downloadUpdate"
            class="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-md transition-colors"
          >
            Download
          </button>
          <button
            @click="dismiss"
            class="px-3 py-1.5 text-text-secondary hover:text-text-primary text-xs transition-colors"
          >
            Later
          </button>
        </div>
      </div>

      <!-- Downloading -->
      <div v-else-if="updateState === 'downloading'" class="flex items-center gap-3 p-3">
        <div class="w-8 h-8 rounded-full bg-info/10 flex items-center justify-center">
          <svg class="w-4 h-4 text-info animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-text-primary">Downloading update...</p>
          <div class="mt-1.5 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
            <div 
              class="h-full bg-accent transition-all duration-300 rounded-full"
              :style="{ width: downloadProgress + '%' }"
            />
          </div>
        </div>
        <span class="text-xs font-medium text-text-secondary">{{ Math.round(downloadProgress) }}%</span>
      </div>

      <!-- Downloaded -->
      <div v-else-if="updateState === 'downloaded'" class="flex items-center justify-between p-3">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-text-primary">Update ready!</p>
            <p class="text-xs text-text-secondary">Restart to install the new version</p>
          </div>
        </div>
        <div class="flex items-center gap-2 ml-3">
          <button
            @click="installUpdate"
            class="px-3 py-1.5 bg-success hover:bg-success-hover text-white text-xs font-medium rounded-md transition-colors"
          >
            Restart Now
          </button>
          <button
            @click="dismiss"
            class="px-3 py-1.5 text-text-secondary hover:text-text-primary text-xs transition-colors"
          >
            Later
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="updateState === 'error'" class="flex items-center justify-between p-3">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-text-primary">Update failed</p>
            <p class="text-xs text-text-secondary">{{ errorMessage }}</p>
          </div>
        </div>
        <button
          @click="dismiss"
          class="px-3 py-1.5 text-text-secondary hover:text-text-primary text-xs transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
const updateState = ref('idle');
const updateVersion = ref('');
const downloadProgress = ref(0);
const errorMessage = ref('');

onMounted(() => {
  // Check if we're in Electron
  if (typeof window !== 'undefined' && window.electronAPI) {
    window.electronAPI.onUpdateAvailable((info) => {
      updateState.value = 'available';
      updateVersion.value = info.version;
    });
    
    window.electronAPI.onUpdateDownloading(() => {
      updateState.value = 'downloading';
    });
    
    window.electronAPI.onUpdateProgress((progress) => {
      downloadProgress.value = progress.percent || 0;
    });
    
    window.electronAPI.onUpdateDownloaded((info) => {
      updateState.value = 'downloaded';
      updateVersion.value = info.version;
    });
    
    window.electronAPI.onUpdateError((message) => {
      updateState.value = 'error';
      errorMessage.value = message;
    });
  }
});

function downloadUpdate() {
  window.electronAPI?.checkForUpdates();
  updateState.value = 'downloading';
}

function installUpdate() {
  window.electronAPI?.installUpdate();
}

function dismiss() {
  updateState.value = 'idle';
  updateVersion.value = '';
  downloadProgress.value = 0;
  errorMessage.value = '';
}
</script>
