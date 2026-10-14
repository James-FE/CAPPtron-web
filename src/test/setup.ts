import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 每次测试结束后，清理上一次渲染的 React 组件
afterEach(() => {
  cleanup()
})
