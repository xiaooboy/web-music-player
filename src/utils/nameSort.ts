/** 默认排序 */
export function defaultNameSort(a: string, b: string): number {
  return a.localeCompare(b, "zh-Hans-CN");
}
