import { reactive } from 'vue';
import {
  parseBulkKeyValue,
  serializeBulkKeyValue,
  type BulkKeyValueSerializeOptions,
} from '~/utils/bulk-key-value';

export function useBulkKeyValueEdit<
  T extends { id: string; key: string; value: string; enabled: boolean },
>() {
  return reactive({
    isBulkEditMode: false,
    bulkString: '',

    enterBulkEdit(items: T[], options?: BulkKeyValueSerializeOptions) {
      this.bulkString = serializeBulkKeyValue(items, options);
      this.isBulkEditMode = true;
    },

    exitBulkEdit(
      createItem: (key: string, value: string, existing?: T) => T,
      existingItems: T[] = [],
    ): T[] {
      const parsed = parseBulkKeyValue(this.bulkString);
      const existingMap = new Map(existingItems.map((item) => [item.key, item]));

      const items = parsed.map(({ key, value }) =>
        createItem(key, value, existingMap.get(key)),
      );

      this.isBulkEditMode = false;
      return items;
    },

    toggleBulkEdit(
      items: T[],
      createItem: (key: string, value: string, existing?: T) => T,
      options?: BulkKeyValueSerializeOptions,
    ): T[] | null {
      if (this.isBulkEditMode) {
        return this.exitBulkEdit(createItem, items);
      }
      this.enterBulkEdit(items, options);
      return null;
    },
  });
}
