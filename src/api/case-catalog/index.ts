import { JsonCaseCatalogReader } from './JsonCaseCatalogReader'

export const caseCatalogReader = new JsonCaseCatalogReader()
// 输入页的具名示例入口明确绑定参考版本；绝不按上传文件名匹配案例。
export const inputExampleCase = { caseId: 'golden-b7', version: 'v2' }
export function caseChoiceKey(caseId: string, version: string) {
  return JSON.stringify(['case', caseId, version])
}
