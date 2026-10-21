import { MockDataFoundationReader } from '../api/data-foundation/mock/MockDataFoundationReader'
import { foundationDemoConfig } from '../api/data-foundation/mock/mockConfig'
import type { DataFoundationReader } from '../api/data-foundation/reader'

// 组合入口固定使用维护者验收的快照；页面重渲染或切换不重建 Reader。
export const dataFoundationReader: DataFoundationReader = new MockDataFoundationReader(
  foundationDemoConfig,
)
