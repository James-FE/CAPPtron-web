import type { Asset, ParseResult } from './client'
import type { Deployment } from './contracts'

export function validateDeployment(value: Deployment): Deployment {
  if (
    value.schema_version !== 'golden-deployment-v1' ||
    !value.source?.trim() ||
    value.template?.id !== 'golden-b7' ||
    !value.template.version ||
    value.template.version === '2.2.0' ||
    !/^[a-f0-9]{64}$/.test(value.template.digest) ||
    !/^[a-f0-9]{64}$/.test(value.execution_profile_digest) ||
    value.engineering_binding_configured !== true
  )
    throw new Error('固定 Golden 部署配置或 EngineeringBinding 未确认；请由部署方发布配置。')
  return value
}
export function goldenRequest(
  config: Deployment,
  asset: Asset,
  parsed: ParseResult,
  command: string,
) {
  validateDeployment(config)
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
      template: config.template,
      source: {
        asset_id: asset.asset_id,
        sha256: asset.sha256,
        parse_command_id: parsed.command_id,
      },
    },
  }
}
