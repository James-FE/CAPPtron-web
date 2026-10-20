import type { MachineType, ManufacturingType, OperationMethod, ToolType } from './types'

// 仅为目录的声明式分类约束，不验证实际机床、装配、运动学或可制造性。
export const machineOperations: Record<MachineType, readonly OperationMethod[]> = {
  cnc_lathe: ['turning', 'drilling', 'boring', 'parting'],
  vertical_machining_center: ['milling', 'drilling', 'boring'],
  cnc_mill: ['milling', 'drilling', 'boring'],
  drill: ['drilling'],
  turn_mill: ['turning', 'milling', 'drilling', 'boring', 'parting'],
}
export const toolOperations: Record<ToolType, readonly OperationMethod[]> = {
  external_turning: ['turning'],
  internal_turning: ['turning', 'boring'],
  parting: ['parting'],
  end_mill: ['milling'],
  drill: ['drilling'],
  boring_bar: ['boring'],
}
export const manufacturingOperations: Record<ManufacturingType, readonly OperationMethod[]> = {
  turning: machineOperations.cnc_lathe,
  milling: machineOperations.cnc_mill,
  drilling: ['drilling'],
  turn_mill: machineOperations.turn_mill,
  mixed: machineOperations.turn_mill,
}
