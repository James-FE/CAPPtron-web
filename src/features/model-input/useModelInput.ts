import { useState } from 'react'
import { demoModel } from '../../api/mock/modelInput'
import { getStepExtension } from './modelInput'
import type { ModelSelection } from './modelInput'

export function useModelInput() {
  const [selection, setSelection] = useState<ModelSelection>({ kind: 'empty' })
  const [error, setError] = useState('')

  function selectFiles(files: readonly File[]) {
    const file = files[0]
    // 取消选择时保留已有文件及其来源，不产生上传或解析状态。
    if (!file) return
    if (files.length !== 1) {
      setError('请一次选择一个 STEP 模型文件；当前有效选择已保留。')
      return
    }
    const extension = getStepExtension(file.name)
    if (!extension) {
      setError('文件格式不支持，请选择 .step 或 .stp 文件（不区分大小写）。')
      return
    }
    setSelection({ kind: 'local', file, extension })
    setError('')
  }

  function selectDemo() {
    setSelection({ kind: 'demo', model: demoModel })
    setError('')
  }

  return { selection, error, selectFiles, selectDemo }
}
