import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deploymentFromTemplate,
  loadIntegrationConfig,
  resolveIntegrationSource,
  DEFAULT_INTEGRATION_CONFIG_URL,
  matchIntegrationTemplate,
  parseIntegrationConfig,
} from './integrationConfig'
import type { LivePlan } from './contracts'
type PlanProducedDto = LivePlan

const digest = 'a'.repeat(64)
function document() {
  return {
    schema_version: 'frontend-integration.v1',
    templates: [
      {
        template: { id: 'synthetic-ring', version: '1.0.0', digest },
        execution_profile_id: 'synthetic-profile',
        matching_evidence: { step_sha256: digest, report_sha256: digest, mcam_sha256: digest },
        operations: [
          {
            id: 'op-a',
            sequence: 1,
            name: '车削',
            steps: [{ id: 'step-a', sequence: 1, content: '加工' }],
            parameter_metadata: {},
          },
        ],
        parameter_rules: [],
      },
    ],
  }
}
function plan(): PlanProducedDto {
  const entry = document().templates[0]!
  return {
    schema_version: 'template-plan-v1-integration',
    provider: 'template',
    event_id: 'e',
    task_id: 't',
    result_id: 'r',
    revision: 1,
    run_id: 'run',
    trace_id: 'trace',
    source_request_id: 'source',
    trigger_request_id: 'trigger',
    feedback_snapshot: { feedback_version: 0, items: [] },
    payload: {
      part: {},
      blank: {},
      resources: {},
      operations: entry.operations.map((op) => ({
        ...op,
        attributes: {},
        steps: op.steps.map((step) => ({ ...step, attributes: {} })),
      })),
      extensions: {
        template: entry.template,
        matching_evidence: entry.matching_evidence,
        parameter_rules: [],
      },
    },
  } as unknown as LivePlan
}
async function rawDigest(bytes: Uint8Array) {
  const hash = await webcrypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('')
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => vi.unstubAllGlobals())

describe('versioned deployment configuration', () => {
  it('only projects the controlled profile source digest and rejects mixed metadata', () => {
    const config = parseIntegrationConfig(document())
    const entry = config.templates[0]!
    entry.operations[0]!.parameter_metadata = { rough_step: { source: { sha256: digest } } }
    expect(deploymentFromTemplate(entry, '/config').execution_profile_digest).toBe(digest)
    entry.operations[0]!.parameter_metadata.other = { source: { sha256: 'b'.repeat(64) } }
    expect(() => deploymentFromTemplate(entry, '/config')).toThrow('source mismatch')
  })
  it('rejects parameter metadata substituted after the descriptor was verified', () => {
    const config = parseIntegrationConfig(document())
    const changed = plan()
    changed.payload.operations[0]!.attributes.parameter_metadata = { rough_step: { unit: 'inch' } }
    expect(() => matchIntegrationTemplate(config, changed)).toThrow('parameter_metadata')
  })
  it('verifies original UTF-8 bytes including formatting before reading the descriptor', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(document(), null, 2) + '\n')
    const expected = await rawDigest(bytes)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes))
    const loaded = await loadIntegrationConfig('/frontend-integration.v1.json', expected, fetcher)
    expect(loaded.sha256).toBe(expected)
    expect(loaded.config.templates[0]!.operations[0]!.name).toBe('车削')
    expect(fetcher).toHaveBeenCalledWith('/frontend-integration.v1.json', { cache: 'no-store' })
  })
  it('rejects modified bytes and never falls back to an embedded Golden configuration', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(document()))
    await expect(
      loadIntegrationConfig(
        '/config',
        'b'.repeat(64),
        vi.fn().mockResolvedValue(new Response(bytes)),
      ),
    ).rejects.toThrow('digest')
    await expect(
      loadIntegrationConfig(
        '/config',
        digest,
        vi.fn().mockResolvedValue(new Response('', { status: 404 })),
      ),
    ).rejects.toThrow('404')
  })
  it('defaults to the same-origin config and its digest sidecar when no build values are set', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(document()))
    const expected = await rawDigest(bytes)
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('.sha256') ? new Response(`${expected}\n`) : new Response(bytes),
    )
    const source = await resolveIntegrationSource(undefined, '', fetcher)
    expect(source).toEqual({ url: DEFAULT_INTEGRATION_CONFIG_URL, sha256: expected })
    expect(fetcher).toHaveBeenCalledWith('/integration-config.json.sha256', { cache: 'no-store' })
    // The sidecar only supplies the expected value; the bytes are still verified.
    const loaded = await loadIntegrationConfig(source.url, source.sha256, fetcher)
    expect(loaded.sha256).toBe(expected)
  })
  it('keeps explicit build values and reports a missing or malformed sidecar', async () => {
    const unused = vi.fn<typeof fetch>()
    await expect(resolveIntegrationSource('/config', digest, unused)).resolves.toEqual({
      url: '/config',
      sha256: digest,
    })
    expect(unused).not.toHaveBeenCalled()
    await expect(
      resolveIntegrationSource(
        '',
        '',
        vi.fn().mockResolvedValue(new Response('', { status: 404 })),
      ),
    ).rejects.toThrow('/integration-config.json.sha256（HTTP 404）')
    await expect(
      resolveIntegrationSource(
        '/config',
        '',
        vi.fn().mockResolvedValue(new Response('not-a-hash')),
      ),
    ).rejects.toThrow('摘要格式无效：/config.sha256')
  })
  it('a sidecar that disagrees with the served bytes is still rejected', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(document()))
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('.sha256') ? new Response('b'.repeat(64)) : new Response(bytes),
    )
    const source = await resolveIntegrationSource(undefined, undefined, fetcher)
    await expect(loadIntegrationConfig(source.url, source.sha256, fetcher)).rejects.toThrow(
      'digest',
    )
  })
  it('requires a pinned SHA and known configuration version', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(loadIntegrationConfig('/config', '', fetcher)).rejects.toThrow('SHA-256')
    expect(fetcher).not.toHaveBeenCalled()
    expect(() => parseIntegrationConfig({ ...document(), schema_version: 'future' })).toThrow(
      'schema_version',
    )
  })
  it('rejects duplicate template identities and duplicate operation/step identities', () => {
    const data = document()
    data.templates.push(structuredClone(data.templates[0]!))
    expect(() => parseIntegrationConfig(data)).toThrow('duplicate')
    const operations = document()
    operations.templates[0]!.operations.push(
      structuredClone(operations.templates[0]!.operations[0]!),
    )
    expect(() => parseIntegrationConfig(operations)).toThrow('duplicate')
  })
  it('matches the complete template and report identities without granting execution', () => {
    const config = parseIntegrationConfig(document())
    expect(matchIntegrationTemplate(config, plan()).execution_profile_id).toBe('synthetic-profile')
    const changed = plan()
    changed.payload.extensions.template = { ...document().templates[0]!.template, version: '2.0.0' }
    expect(() => matchIntegrationTemplate(config, changed)).toThrow('template')
    changed.payload.extensions.template = document().templates[0]!.template
    changed.payload.extensions.matching_evidence = {
      ...document().templates[0]!.matching_evidence,
      report_sha256: 'b'.repeat(64),
    }
    expect(() => matchIntegrationTemplate(config, changed)).toThrow('report_sha256')
  })
  it('refuses stale operation identities and parameter rules, while accepting a descriptor without metadata', () => {
    const config = parseIntegrationConfig(document())
    const changed = plan()
    changed.payload.operations[0]!.id = 'other'
    expect(() => matchIntegrationTemplate(config, changed)).toThrow('operations')
    const rulesChanged = plan()
    rulesChanged.payload.extensions.parameter_rules = [
      {
        operation_id: 'op-a',
        parameter_id: 'rough_step',
        unit: 'mm',
        edit_policy: 'replace',
        value_type: 'number',
      },
    ]
    expect(() => matchIntegrationTemplate(config, rulesChanged)).toThrow('parameter_rules')
    expect(matchIntegrationTemplate(config, plan()).operations[0]!.parameter_metadata).toEqual({})
  })
})
