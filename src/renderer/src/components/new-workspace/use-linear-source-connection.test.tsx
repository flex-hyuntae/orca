// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { LinearConnectionStatus } from '../../../../shared/linear/workspace-types'
import { useLinearSourceConnection } from './use-linear-source-connection'

const mocks = vi.hoisted(() => ({ linearStatus: vi.fn() }))
vi.mock('@/runtime/runtime-linear-client', () => mocks)

function context(hostId: TaskSourceContext['hostId']): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'linear',
    projectId: 'project-1',
    hostId,
    repoId: 'repo-1',
    accountLabel: null,
    providerIdentity: null
  }
}

function status(connected: boolean): LinearConnectionStatus {
  return { connected, viewer: null }
}

describe('useLinearSourceConnection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the explicit source host independently of focused runtime status', async () => {
    const source = context('runtime:source-host')
    mocks.linearStatus.mockResolvedValue(status(true))
    const { result } = renderHook(() =>
      useLinearSourceConnection({ enabled: true, sourceContext: source })
    )
    expect(result.current).toEqual({ status: null, loaded: false })
    await waitFor(() => expect(result.current.status?.connected).toBe(true))
    expect(result.current.loaded).toBe(true)
    expect(mocks.linearStatus).toHaveBeenCalledWith(source)
  })

  it('does not add reads to existing consumers without an explicit source', async () => {
    renderHook(() => useLinearSourceConnection({ enabled: true, sourceContext: null }))
    renderHook(() => useLinearSourceConnection({ enabled: false, sourceContext: context('local') }))
    await act(async () => {})
    expect(mocks.linearStatus).not.toHaveBeenCalled()
  })

  it('keeps equivalent source objects from refetching on every renderer update', async () => {
    mocks.linearStatus.mockResolvedValue(status(true))
    const { result, rerender } = renderHook(() =>
      useLinearSourceConnection({ enabled: true, sourceContext: context('local') })
    )
    await waitFor(() => expect(result.current.loaded).toBe(true))
    const loaded = result.current
    rerender()
    expect(result.current).toBe(loaded)
    expect(mocks.linearStatus).toHaveBeenCalledTimes(1)
  })

  it('hides old status immediately and rejects late responses after a host switch', async () => {
    let resolveOld: (value: LinearConnectionStatus) => void = () => {}
    const oldRead = new Promise<LinearConnectionStatus>((resolve) => {
      resolveOld = resolve
    })
    mocks.linearStatus.mockReturnValueOnce(oldRead).mockResolvedValueOnce(status(false))
    const { result, rerender } = renderHook(
      ({ source }) => useLinearSourceConnection({ enabled: true, sourceContext: source }),
      { initialProps: { source: context('local') } }
    )
    rerender({ source: context('runtime:new-host') })
    expect(result.current).toEqual({ status: null, loaded: false })
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(async () => {
      resolveOld(status(true))
      await oldRead
    })
    expect(result.current.status?.connected).toBe(false)
  })

  it('settles failed status reads as disconnected', async () => {
    mocks.linearStatus.mockRejectedValue(new Error('Host unavailable'))
    const { result } = renderHook(() =>
      useLinearSourceConnection({ enabled: true, sourceContext: context('runtime:offline') })
    )
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.status?.connected).toBe(false)
  })
})
