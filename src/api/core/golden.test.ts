import { expect, it } from 'vitest'
import { goldenPlanningRequest } from './golden'
it('binds the seven-operation template to the actual parse receipt without fabricated geometry', () => {
  const body = goldenPlanningRequest(
    { asset_id: 'asset', sha256: 'hash', filename: 'ring.stp', status: 'stored' },
    {
      command_id: 'parse',
      asset_id: 'asset',
      source_sha256: 'hash',
      status: 'parsed',
      execution_ready: false,
    },
    'create',
  )
  expect(body.payload.template.version).toBe('2.3.0')
  expect(body.payload.source).toEqual({
    asset_id: 'asset',
    sha256: 'hash',
    parse_command_id: 'parse',
  })
  expect(body.payload).not.toHaveProperty('part')
})
it('rejects a mismatched parse receipt', () => {
  expect(() =>
    goldenPlanningRequest(
      { asset_id: 'a', sha256: 'h', filename: 'ring.stp', status: 'stored' },
      {
        command_id: 'p',
        asset_id: 'other',
        source_sha256: 'h',
        status: 'parsed',
        execution_ready: false,
      },
      'create',
    ),
  ).toThrow()
})
