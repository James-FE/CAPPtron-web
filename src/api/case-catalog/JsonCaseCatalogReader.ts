import type { CaseCatalogReader } from './types'
import { validateCaseIndex, verifyCaseVersion } from './validation'

export class JsonCaseCatalogReader implements CaseCatalogReader {
  constructor(
    private readonly baseUrl = import.meta.env.BASE_URL,
    private readonly request: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async read(path: string): Promise<unknown> {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`
    try {
      const response = await this.request(`${base}case-catalog/${path}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      throw new Error(`案例数据读取失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  async listCases() {
    return validateCaseIndex(await this.read('index.json')).cases
  }

  async getCaseVersion(caseId: string, version: string) {
    const cases = await this.listCases()
    const summary = cases.find((item) => item.caseId === caseId)
    const reference = summary?.versions.find((item) => item.version === version)
    if (!summary || !reference) throw new Error('案例或指定版本不在当前索引中')
    return verifyCaseVersion(await this.read(reference.path), summary, version)
  }
}
