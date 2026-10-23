import { describe, expect, it } from 'vitest'
import { parsePlanProduced, parseNcVersion } from './dto'
import { toLiveProcessPlan } from './viewModel'

const sha = 'a'.repeat(64)
const orderedIds = [
  'ring-op-1',
  'ring-op-7',
  'ring-op-2',
  'ring-op-3',
  'ring-op-4',
  'ring-op-5',
  'ring-op-6',
]
function validPlan() {
  return {
    schema_version: 'template-plan-v1-integration',
    provider: 'template',
    event_id: 'event-synthetic',
    task_id: 'task-synthetic',
    result_id: 'result-synthetic',
    revision: 2,
    run_id: 'planning-run-synthetic',
    trace_id: 'trace-synthetic',
    source_request_id: 'request-source',
    trigger_request_id: 'request-trigger',
    feedback_snapshot: { feedback_version: 0, items: [] },
    payload: {
      part: { name: '合成环件' },
      blank: {},
      resources: {},
      operations: orderedIds.map((id, index) => ({
        id,
        sequence: index + 1,
        name: `工序 ${index + 1}`,
        steps: [{ id: `step-${id}`, sequence: 1, content: `步骤 ${id}`, attributes: {} }],
        attributes:
          index === 2
            ? {
                parameters: { rough_step: 0.4, spindle_speed: 900 },
                parameter_metadata: {
                  rough_step: {
                    name: '粗车层深',
                    unit: 'mm',
                    edit_policy: 'replace',
                    allowed_values: [0.5, 0.4],
                    source: {
                      kind: 'synthetic_profile',
                      resource_id: 'profile-synthetic',
                      sha256: sha,
                      pointer: '/rough_step',
                      engineering_status: 'unconfirmed',
                    },
                  },
                },
                source_parameters: [
                  {
                    id: 'historical-speed',
                    name: '历史转速',
                    value: 850,
                    unit: 'r/min',
                    source: 'historical_record',
                    status: 'provided',
                    inputKind: 'number',
                    editPolicy: 'read_only',
                  },
                ],
                resources: [
                  {
                    id: 'reference-tool',
                    name: '参考刀具',
                    kind: 'tool',
                    status: 'pending',
                    source: 'historical_record',
                  },
                ],
              }
            : {},
      })),
      extensions: {
        template: { id: 'golden-b7', version: '2.3.0', digest: sha },
        plan_digest: sha,
        reference_only: false,
        execution_ready: true,
        source_binding: 'integration_pending',
        preparation: {},
        applied_feedback_ids: [],
        engineering_status: 'pending',
        matching_evidence: {},
        parameter_rules: [
          {
            path: '/operations/2/attributes/parameters/rough_step',
            operation_id: 'ring-op-2',
            parameter_id: 'rough_step',
            value_type: 'number',
            unit: 'mm',
            allowed_values: [0.5, 0.4],
            edit_policy: 'replace',
          },
        ],
      },
    },
  }
}

describe('Core plan DTO and view model', () => {
  it('keeps the seven server sequences and stable IDs without ID sorting', () => {
    const view = toLiveProcessPlan(parsePlanProduced(validPlan()))
    expect(view.operations.map((operation) => [operation.id, operation.sequence])).toEqual(
      orderedIds.map((id, index) => [id, index + 1]),
    )
    expect(view.operations[2]?.steps[0]).toMatchObject({
      id: 'step-ring-op-2',
      sequence: 1,
      name: '步骤 ring-op-2',
    })
    expect(view.id).toContain('task-synthetic')
  })
  it('sorts legal unordered arrays by server sequence while retaining the original rule path', () => {
    const plan = validPlan()
    const rough = plan.payload.operations.splice(2, 1)[0]!
    rough.steps.unshift({ id: 'second-step', sequence: 2, content: '第二步', attributes: {} })
    plan.payload.operations.unshift(rough)
    plan.payload.extensions.parameter_rules[0]!.path =
      '/operations/0/attributes/parameters/rough_step'
    const view = toLiveProcessPlan(parsePlanProduced(plan))
    expect(view.operations.map((item) => item.id)).toEqual(orderedIds)
    expect(view.operations[2]!.steps.map((item) => item.sequence)).toEqual([1, 2])
    expect(view.operations[2]!.parameters.find((item) => item.id === 'rough_step')?.editable).toBe(
      true,
    )
  })
  it('uses metadata and matching discrete rules only for editable values', () => {
    const operation = toLiveProcessPlan(parsePlanProduced(validPlan())).operations[2]!
    expect(operation.parameters.find((item) => item.id === 'rough_step')).toMatchObject({
      value: 0.4,
      unit: 'mm',
      editable: true,
      allowedValues: [0.5, 0.4],
    })
    expect(operation.parameters.find((item) => item.id === 'spindle_speed')).toMatchObject({
      value: 900,
      editable: false,
    })
    expect(operation.parameters.find((item) => item.id === 'spindle_speed')?.unit).toBeUndefined()
    expect(operation.parameters.find((item) => item.id === 'historical-speed')).toMatchObject({
      value: 850,
      editable: false,
      source: 'historical_record',
    })
    expect(operation.resources).toEqual([
      {
        id: 'reference-tool',
        name: '参考刀具',
        kind: 'tool',
        status: 'pending',
        source: 'historical_record',
      },
    ])
  })

  it.each([
    ['upstream', 'upstream'],
    ['synthetic_profile', 'synthetic_profile'],
    ['future_source', 'future_source'],
    [undefined, 'unknown'],
    [42, 'unknown'],
    ['', 'unknown'],
  ])('retains reference provenance %s without inventing history', (source, expected) => {
    const plan = validPlan()
    const attrs = plan.payload.operations[2]!.attributes as Record<string, unknown>
    attrs.source_parameters = [{ id: 'reference', value: 850, source }]
    attrs.resources = [{ id: 'tool', name: '参考刀具', source }]
    const operation = toLiveProcessPlan(parsePlanProduced(plan)).operations[2]!
    expect(operation.parameters.find((item) => item.id === 'reference')).toMatchObject({
      source: expected,
      editable: false,
    })
    expect(operation.resources[0]?.source).toBe(expected)
  })
  it('keeps a rule read only when its operation has no matching metadata', () => {
    const plan = validPlan()
    delete (plan.payload.operations[2]!.attributes as Record<string, unknown>).parameter_metadata
    const parameter = toLiveProcessPlan(parsePlanProduced(plan)).operations[2]!.parameters.find(
      (item) => item.id === 'rough_step',
    )
    expect(parameter).toMatchObject({ value: 0.4, editable: false })
    expect(parameter?.unit).toBeUndefined()
  })
  it('rejects duplicate IDs and duplicate server sequence', () => {
    const duplicate = validPlan()
    duplicate.payload.operations[1]!.id = duplicate.payload.operations[0]!.id
    expect(() => parsePlanProduced(duplicate)).toThrow(/duplicate|sequence/i)
    const sequence = validPlan()
    sequence.payload.operations[1]!.sequence = 1
    expect(() => parsePlanProduced(sequence)).toThrow(/duplicate|sequence/i)
  })
  it('rejects incomplete envelopes and malformed parameter rules', () => {
    const incomplete = validPlan() as Record<string, unknown>
    delete incomplete.feedback_snapshot
    expect(() => parsePlanProduced(incomplete)).toThrow(/feedback_snapshot/)
    const malformed = validPlan()
    malformed.payload.extensions.parameter_rules[0]!.allowed_values = [0.5, 0.45]
    expect(() => parsePlanProduced(malformed)).toThrow(/allowed_values|metadata/)
  })
  it('rejects unknown providers and schema/profile state mismatches', () => {
    const unknown = validPlan()
    unknown.provider = 'mock'
    expect(() => parsePlanProduced(unknown)).toThrow(/provider/)
    const mismatch = validPlan()
    mismatch.schema_version = 'template-plan-v1'
    expect(() => parsePlanProduced(mismatch)).toThrow(/reference_only|profile/)
    const absent = validPlan()
    delete (absent.payload.extensions as Record<string, unknown>).matching_evidence
    expect(() => parsePlanProduced(absent)).toThrow(/matching_evidence/)
  })
  it('validates an exact NC version and retains file identity, encoding and sequence', () => {
    const nc = parseNcVersion({
      ref: { cam_run_id: 'cam-synthetic', version: 2, content_digest: sha },
      plan_ref: {
        task_id: 'task-synthetic',
        result_id: 'result-synthetic',
        revision: 2,
        archive_digest: sha,
      },
      origin: 'human_edit',
      parent: null,
      feedback_id: null,
      review_status: 'pending',
      files: [
        {
          file_id: 'setup/T.NC',
          filename: 'T.NC',
          setup_id: 'setup',
          sequence: 1,
          encoding: 'utf-8-sig',
          sha256: sha,
          size_bytes: 8,
        },
      ],
      reviews: [],
      simulation_version: null,
      comparison_sha256: null,
      root_run_id: 'cam-synthetic',
      is_current_candidate: true,
      allowed_actions: ['review'],
    })
    expect(nc.files[0]).toMatchObject({ file_id: 'setup/T.NC', encoding: 'utf-8-sig', sequence: 1 })
  })
  it('normalizes omitted NC default fields and sorts files by server sequence', () => {
    const raw = {
      ref: { cam_run_id: 'cam-synthetic', version: 2, content_digest: sha },
      plan_ref: {
        task_id: 'task-synthetic',
        result_id: 'result-synthetic',
        revision: 2,
        archive_digest: sha,
      },
      origin: 'cam_generated',
      review_status: 'pending',
      files: [
        {
          file_id: 'second',
          filename: 'B.NC',
          setup_id: 'setup',
          sequence: 2,
          encoding: 'utf-8',
          sha256: sha,
          size_bytes: 8,
        },
        {
          file_id: 'first',
          filename: 'A.NC',
          setup_id: 'setup',
          sequence: 1,
          encoding: 'utf-8',
          sha256: sha,
          size_bytes: 8,
        },
      ],
      reviews: [],
      root_run_id: 'cam-synthetic',
      is_current_candidate: true,
      allowed_actions: [],
    }
    const nc = parseNcVersion(raw)
    expect(nc).toMatchObject({
      parent: null,
      simulation_version: null,
      feedback_id: null,
      comparison_sha256: null,
    })
    expect(nc.files.map((item) => item.file_id)).toEqual(['first', 'second'])
  })
})
