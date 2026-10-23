import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadIntegrationConfig,
  matchIntegrationTemplate,
  parseIntegrationConfig,
} from './integrationConfig'
import type { PlanProducedDto } from './dto'

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
  }
}
async function rawDigest(bytes: Uint8Array) {
  const hash = await webcrypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('')
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => vi.unstubAllGlobals())

describe('versioned deployment configuration', () => {
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
      { operation_id: 'op-a', parameter_id: 'rough_step' },
    ]
    expect(() => matchIntegrationTemplate(config, rulesChanged)).toThrow('parameter_rules')
    expect(matchIntegrationTemplate(config, plan()).operations[0]!.parameter_metadata).toEqual({})
  })
})
