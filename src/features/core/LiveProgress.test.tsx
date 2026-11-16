import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LiveProgress } from './LiveProgress'
import type { LiveWorkflow } from './useLiveWorkflow'

afterEach(cleanup)
const workflow = (values: Partial<LiveWorkflow>) => values as LiveWorkflow
it('构建失败只提供手动新运行，不自动重发或要求重新批准', () => {
  const startCam = vi.fn()
  render(
    <LiveProgress
      cam
      live={workflow({
        simulation: true,
        cam: {
          cam_run_id: 'failed',
          status: 'failed',
          phase: 'build',
          allowed_actions: [],
          current_candidate: null,
        },
        canRestartBuild: true,
        startCam,
      })}
    />,
  )
  expect(screen.getByText('本次运行已失败')).toBeInTheDocument()
  expect(startCam).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '重新运行 CAM' }))
  expect(startCam).toHaveBeenCalledTimes(1)
})
it('工艺完成后保留原型进度条并显示100%', () => {
  render(
    <LiveProgress
      live={workflow({ status: '工艺方案已就绪', session: {} as LiveWorkflow['session'] })}
    />,
  )
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100')
  expect(screen.getByText('100%')).toBeInTheDocument()
})
it('运行中不伪造百分比，失败后停止动画', () => {
  const { rerender } = render(
    <LiveProgress live={workflow({ busy: true, status: '正在形成工艺方案' })} />,
  )
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
  rerender(<LiveProgress live={workflow({ busy: false, status: '规划失败', error: '请求失败' })} />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0')
  expect(screen.queryByText('100%')).not.toBeInTheDocument()
})
