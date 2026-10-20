import { FoundationError } from './reader'

export function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}
export function isTimestamp(value: string): boolean {
  const match =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    )
  return (
    !!match &&
    isBusinessDate(match[1]!) &&
    !value.endsWith('-00:00') &&
    Number.isFinite(Date.parse(value))
  )
}
export function isTimeZone(value: string): boolean {
  try {
    // 拒绝偏移量名称；契约使用 UTC 或 IANA 时区，以保留历史和夏令时规则。
    if (value.startsWith('+') || value.startsWith('-')) return false
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
    return value.length > 0
  } catch {
    return false
  }
}
export function businessDate(timestamp: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const field = (name: string) => parts.find((part) => part.type === name)!.value
  return `${field('year')}-${field('month')}-${field('day')}`
}
export function shiftDate(date: string, days: number): string {
  const result = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10)
  if (!isBusinessDate(result)) throw new FoundationError('invalid_query', '日期窗口超出支持范围')
  return result
}
