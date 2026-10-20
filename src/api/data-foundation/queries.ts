import Ajv from 'ajv'
import { FoundationError } from './reader'
import { businessDate, isBusinessDate, isTimeZone, shiftDate } from './time'
import {
  assetKinds,
  type AssetQuery,
  type FoundationDataset,
  type HotAssetQuery,
  type OverviewQuery,
  type TrendQuery,
} from './types'

const ajv = new Ajv({ allErrors: true, strict: true })
ajv.addFormat('business-date', isBusinessDate)
ajv.addFormat('business-timezone', isTimeZone)
const date = { type: 'string', format: 'business-date' }
const timeZone = { type: 'string', format: 'business-timezone' }
const windowProperties = {
  endDate: date,
  timeZone,
  days: { type: 'integer', minimum: 1, maximum: 366 },
}
function queryValidator<T>(properties: object) {
  const validate = ajv.compile<T>({ type: 'object', properties, additionalProperties: false })
  return (value: unknown): T => {
    if (!validate(value))
      throw new FoundationError(
        'invalid_query',
        '数据底座查询参数不合法',
        (validate.errors ?? []).map((error) => ({
          path: error.instancePath,
          message: error.message ?? error.keyword,
        })),
      )
    return value
  }
}
const overviewQuery = queryValidator<OverviewQuery>({ date, timeZone })
const trendQuery = queryValidator<TrendQuery>(windowProperties)
const hotQuery = queryValidator<HotAssetQuery>({
  ...windowProperties,
  limit: { type: 'integer', minimum: 1, maximum: 100 },
})
const assetQuery = queryValidator<AssetQuery>({
  kind: { type: 'string', enum: assetKinds },
  keyword: { type: 'string', maxLength: 200 },
  sortBy: { type: 'string', enum: ['name', 'createdAt', 'id'] },
  sortDirection: { type: 'string', enum: ['asc', 'desc'] },
  page: { type: 'integer', minimum: 1, maximum: 1000000 },
  pageSize: { type: 'integer', minimum: 1, maximum: 100 },
})

export function resolveOverviewQuery(dataset: FoundationDataset, input: OverviewQuery = {}) {
  const query = overviewQuery(input)
  const zone = query.timeZone ?? dataset.timeZone
  const today = businessDate(dataset.asOf, zone)
  const queryDate = query.date ?? today
  if (queryDate > today) throw new FoundationError('invalid_query', '查询日期晚于快照业务日期')
  return { date: queryDate, timeZone: zone }
}
export function resolveWindow(dataset: FoundationDataset, input: TrendQuery, hot = false) {
  const query = hot ? hotQuery(input) : trendQuery(input)
  const zone = query.timeZone ?? dataset.timeZone
  const today = businessDate(dataset.asOf, zone)
  const endDate = query.endDate ?? today
  if (endDate > today) throw new FoundationError('invalid_query', '窗口结束日晚于快照业务日期')
  const days = query.days ?? 7
  return {
    timeZone: zone,
    days,
    startDate: shiftDate(endDate, 1 - days),
    endDate,
    limit: hot ? ((query as HotAssetQuery).limit ?? 5) : 5,
  }
}
export function resolveAssetQuery(input: AssetQuery) {
  const query = assetQuery(input)
  return {
    ...query,
    keyword: (query.keyword ?? '').normalize('NFKC').trim().toLowerCase(),
    sortBy: query.sortBy ?? 'createdAt',
    sortDirection: query.sortDirection ?? 'desc',
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  }
}
export function validateAssetIdentity(kind: string, id: string) {
  if (
    !assetKinds.some((item) => item === kind) ||
    typeof id !== 'string' ||
    !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(id)
  )
    throw new FoundationError('invalid_query', '资源类型或 ID 不合法')
}
