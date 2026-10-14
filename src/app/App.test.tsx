import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('engineering bootstrap', () => {
  it('marks the initial screen as a scaffold, not a real CAM product', () => {
    render(<App />)
    expect(screen.getByText('Scaffold only')).toBeInTheDocument()
    expect(screen.getByText(/No STEP parsing/)).toBeInTheDocument()
  })

  it('switches workstream details without asserting real business state', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /02 \/ Process Planning/ }))
    expect(screen.getByText(/Operations, steps, parameters/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /02 \/ Process Planning/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
