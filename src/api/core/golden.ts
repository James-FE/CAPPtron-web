import type { Asset, ParseResult } from './client'

// 固定 Golden 演示身份；尺寸与特征由 Core 从真实解析回执推导。
export const goldenTemplate = {
  id: 'golden-b7',
  version: '2.3.0',
  digest: '6dbc61c6e11583db52a5ef60c58305df4032837e9f0f72e212110545ae44e861',
}
export function goldenPlanningRequest(asset: Asset, parsed: ParseResult, command: string) {
  if (
    parsed.status !== 'parsed' ||
    parsed.asset_id !== asset.asset_id ||
    parsed.source_sha256 !== asset.sha256
  )
    throw new Error('解析回执与上传 STEP 不匹配')
  return {
    command_id: command,
    schema_version: 'template-request-v1',
    payload: {
      template: goldenTemplate,
      source: {
        asset_id: asset.asset_id,
        sha256: asset.sha256,
        parse_command_id: parsed.command_id,
      },
    },
  }
}
