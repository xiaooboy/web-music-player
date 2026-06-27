/** 获取对象的值为字符串的 key */
type StringPropertyKeys<T extends object> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];
/**
 * 默认排序 - 不改动原数组
 * @param list 要排序的数组
 * @param key 排序的键，对应属性值需要为字符串
 */
export function defaultSort<T extends object>(
  list: T[],
  key: StringPropertyKeys<T>,
): T[] {
  return list.toSorted((a, b) =>
    defaultStringCompare(a[key] as string, b[key] as string),
  );
}
/** 默认字符比较 */
const collator = new Intl.Collator("zh-Hans-CN");
/** 默认字符比较 */
export function defaultStringCompare(a: string, b: string): number {
  return collator.compare(a, b);
}
