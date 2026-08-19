<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

export interface EnvironmentOption {
  id: string;
  name: string;
  isMockEnvironment?: boolean;
}

interface Props {
  environments: EnvironmentOption[];
  modelValue: string[];
  loading?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  disabled: false
});

const emit = defineEmits<{
  'update:modelValue': [ids: string[]];
}>();

const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);

const sortedEnvironments = computed(() => {
  return [...props.environments].sort((a, b) => a.name.localeCompare(b.name));
});

const filteredEnvironments = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return sortedEnvironments.value;
  return sortedEnvironments.value.filter((environment) =>
    environment.name.toLowerCase().includes(query)
  );
});

const selectedEnvironments = computed(() => {
  const selected = new Set(props.modelValue);
  return sortedEnvironments.value.filter((environment) => selected.has(environment.id));
});

const allFilteredSelected = computed(() => {
  if (filteredEnvironments.value.length === 0) return false;
  return filteredEnvironments.value.every((environment) =>
    props.modelValue.includes(environment.id)
  );
});

const someFilteredSelected = computed(() => {
  return filteredEnvironments.value.some((environment) =>
    props.modelValue.includes(environment.id)
  );
});

const updateSelection = (ids: string[]) => {
  emit('update:modelValue', ids);
};

const toggleEnvironment = (environmentId: string) => {
  if (props.disabled) return;

  const selected = props.modelValue;
  if (selected.includes(environmentId)) {
    updateSelection(selected.filter((id) => id !== environmentId));
    return;
  }
  updateSelection([...selected, environmentId]);
};

const removeEnvironment = (environmentId: string) => {
  if (props.disabled) return;
  updateSelection(props.modelValue.filter((id) => id !== environmentId));
};

const selectAllFiltered = () => {
  if (props.disabled) return;

  const merged = new Set(props.modelValue);
  for (const environment of filteredEnvironments.value) {
    merged.add(environment.id);
  }
  updateSelection([...merged]);
};

const clearAll = () => {
  if (props.disabled) return;
  updateSelection([]);
};

const clearFiltered = () => {
  if (props.disabled) return;

  const filteredIds = new Set(filteredEnvironments.value.map((environment) => environment.id));
  updateSelection(props.modelValue.filter((id) => !filteredIds.has(id)));
};

const handleSelectAllToggle = () => {
  if (allFilteredSelected.value) {
    clearFiltered();
    return;
  }
  selectAllFiltered();
};

const clearSearch = () => {
  searchQuery.value = '';
  nextTick(() => {
    searchInputRef.value?.focus();
  });
};

const focusSearch = () => {
  nextTick(() => {
    searchInputRef.value?.focus();
  });
};

watch(
  () => props.environments,
  () => {
    searchQuery.value = '';
  }
);

defineExpose({ focusSearch, clearSearch });
</script>

<template>
  <div class="env-multi-select">
    <div
      v-if="loading"
      class="env-multi-select__state"
    >
      Loading environments...
    </div>

    <div
      v-else-if="environments.length === 0"
      class="env-multi-select__state"
    >
      This project has no environments to include.
    </div>

    <template v-else>
      <div class="env-multi-select__toolbar">
        <div class="env-multi-select__search">
          <svg
            class="env-multi-select__search-icon"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="Search environments..."
            spellcheck="false"
            :disabled="disabled"
            class="env-multi-select__search-input"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="env-multi-select__search-clear"
            title="Clear search"
            :disabled="disabled"
            @click="clearSearch"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <span
            v-else-if="filteredEnvironments.length > 0"
            class="env-multi-select__result-count"
          >
            {{ filteredEnvironments.length }}
          </span>
        </div>

        <div class="env-multi-select__actions">
          <span class="env-multi-select__selected-count">
            {{ modelValue.length }} selected
          </span>
          <button
            v-if="filteredEnvironments.length > 0"
            type="button"
            class="env-multi-select__action-btn"
            :disabled="disabled"
            @click="handleSelectAllToggle"
          >
            {{ allFilteredSelected ? 'Deselect visible' : searchQuery ? 'Select visible' : 'Select all' }}
          </button>
          <button
            v-if="modelValue.length > 0"
            type="button"
            class="env-multi-select__action-btn"
            :disabled="disabled"
            @click="clearAll"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        v-if="selectedEnvironments.length > 0"
        class="env-multi-select__chips"
      >
        <button
          v-for="environment in selectedEnvironments"
          :key="environment.id"
          type="button"
          class="env-multi-select__chip"
          :disabled="disabled"
          :title="`Remove ${environment.name}`"
          @click="removeEnvironment(environment.id)"
        >
          <span class="env-multi-select__chip-label">{{ environment.name }}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div
        v-if="filteredEnvironments.length === 0"
        class="env-multi-select__empty"
      >
        <p class="env-multi-select__empty-text">
          No environments match "{{ searchQuery }}"
        </p>
        <button
          type="button"
          class="env-multi-select__action-btn"
          :disabled="disabled"
          @click="clearSearch"
        >
          Clear search
        </button>
      </div>

      <div
        v-else
        class="env-multi-select__list"
        role="listbox"
        aria-multiselectable="true"
        :aria-label="`${modelValue.length} environments selected`"
      >
        <label
          v-for="environment in filteredEnvironments"
          :key="environment.id"
          class="env-multi-select__item"
          :class="{ 'env-multi-select__item--selected': modelValue.includes(environment.id) }"
        >
          <input
            type="checkbox"
            class="env-multi-select__checkbox"
            :checked="modelValue.includes(environment.id)"
            :disabled="disabled"
            @change="toggleEnvironment(environment.id)"
          />
          <span class="env-multi-select__item-main">
            <span
              class="env-multi-select__indicator"
              :class="{ 'env-multi-select__indicator--mock': environment.isMockEnvironment }"
            />
            <span
              class="env-multi-select__name"
              :class="{ 'env-multi-select__name--mock': environment.isMockEnvironment }"
            >
              {{ environment.name }}
            </span>
            <span
              v-if="environment.isMockEnvironment"
              class="env-multi-select__badge"
            >
              Mock
            </span>
          </span>
        </label>
      </div>

      <p
        v-if="searchQuery && someFilteredSelected && !allFilteredSelected"
        class="env-multi-select__hint"
      >
        {{ filteredEnvironments.filter((environment) => modelValue.includes(environment.id)).length }}
        of {{ filteredEnvironments.length }} visible environments selected.
      </p>
    </template>
  </div>
</template>

<style scoped>
.env-multi-select {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  overflow: hidden;
}

.env-multi-select__state {
  padding: 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.env-multi-select__toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.env-multi-select__search {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.env-multi-select__search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.env-multi-select__search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 12px;
  padding: 2px 0;
}

.env-multi-select__search-input::placeholder {
  color: var(--text-muted);
}

.env-multi-select__search-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.env-multi-select__search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.env-multi-select__search-clear:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.env-multi-select__result-count {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  line-height: 16px;
}

.env-multi-select__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.env-multi-select__selected-count {
  font-size: 11px;
  color: var(--text-muted);
  margin-right: auto;
}

.env-multi-select__action-btn {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent-blue);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.1s ease;
}

.env-multi-select__action-btn:hover:not(:disabled) {
  color: color-mix(in srgb, var(--accent-blue) 80%, white);
}

.env-multi-select__action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.env-multi-select__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--accent-blue) 6%, var(--bg-input));
  max-height: 88px;
  overflow-y: auto;
}

.env-multi-select__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 6px 2px 8px;
  border: 1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-blue) 12%, var(--bg-secondary));
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.1s ease, border-color 0.1s ease;
}

.env-multi-select__chip:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-blue) 18%, var(--bg-secondary));
  border-color: color-mix(in srgb, var(--accent-blue) 40%, transparent);
}

.env-multi-select__chip:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.env-multi-select__chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.env-multi-select__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  text-align: center;
}

.env-multi-select__empty-text {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.env-multi-select__list {
  max-height: 176px;
  overflow-y: auto;
  padding: 4px;
}

.env-multi-select__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.env-multi-select__item:hover {
  background: var(--bg-hover);
}

.env-multi-select__item--selected {
  background: color-mix(in srgb, var(--accent-blue) 8%, transparent);
}

.env-multi-select__item--selected:hover {
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
}

.env-multi-select__checkbox {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin: 0;
  border-radius: 3px;
  border-color: var(--border-color);
  accent-color: var(--accent-blue);
  cursor: pointer;
}

.env-multi-select__item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.env-multi-select__indicator {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-blue);
}

.env-multi-select__indicator--mock {
  background: var(--accent-purple);
}

.env-multi-select__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-primary);
}

.env-multi-select__name--mock {
  color: color-mix(in srgb, var(--accent-purple) 75%, var(--text-primary));
}

.env-multi-select__badge {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent-purple);
  background: color-mix(in srgb, var(--accent-purple) 14%, transparent);
  padding: 1px 5px;
  border-radius: 4px;
}

.env-multi-select__hint {
  margin: 0;
  padding: 6px 10px 8px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);
}
</style>
