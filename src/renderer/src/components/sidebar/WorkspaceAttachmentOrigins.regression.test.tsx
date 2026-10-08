// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import type { Tab } from '../../../../shared/tab-types'
import type { WorkspaceAttachmentOrigin } from '../../../../shared/worktree/types'
import { makeWorktree } from '../../store/slices/worktrees-slice-test-fixtures'
import { WorkspaceAttachmentOrigins } from './WorkspaceAttachmentOrigins'

const mocks = vi.hoisted(() => {
  const state: Pick<
    AppState,
    'unifiedTabsByWorktree' | 'terminalLayoutsByTabId' | 'tabsByWorktree' | 'agentStatusByPaneKey'
  > = {
    unifiedTabsByWorktree: {},
    terminalLayoutsByTabId: {},
    tabsByWorktree: {},
    agentStatusByPaneKey: {}
  }
  return { state }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('@/attention/notification-subject-owner', () => ({
  resolveNotificationTabOwner: (_state: unknown, tab: Tab) => ({
    executionHostId: tab.executionHostId ?? 'local',
    runtimeEnvironmentId: null
  })
}))
const workspace = makeWorktree({ id: 'repo::/feature', repoId: 'repo', hostId: 'local' })
const localTab: Tab = {
  id: 'same-tab',
  entityId: 'same-tab',
  groupId: 'group',
  worktreeId: workspace.id,
  executionHostId: 'local',
  contentType: 'terminal',
  label: 'Current terminal',
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 0
}
const foreignOrigin: WorkspaceAttachmentOrigin = {
  kind: 'observed',
  tabId: localTab.id,
  hostId: 'ssh:other',
  label: 'Other host terminal'
}
beforeEach(() => {
  mocks.state.unifiedTabsByWorktree = { [workspace.id]: [localTab] }
})
afterEach(cleanup)

describe('session association host and keyboard regressions', () => {
  it('keeps another host observation unavailable even when a live tab has the same id', () => {
    render(
      <WorkspaceAttachmentOrigins
        workspace={workspace}
        item={{ provider: 'github', type: 'pr', number: 23, origins: [foreignOrigin] }}
      />
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/Other host terminal/).textContent).toContain('Tab unavailable')
  })
  it.each([
    ['Escape', false, false],
    ['Enter', true, false],
    ['Enter', false, true]
  ])(
    'allows parent dialog shortcut %s meta=%s ctrl=%s from an observation link',
    (key, metaKey, ctrlKey) => {
      const parent = vi.fn()
      render(
        <div onKeyDown={parent}>
          <WorkspaceAttachmentOrigins
            workspace={workspace}
            item={{
              provider: 'github',
              type: 'pr',
              number: 23,
              origins: [{ kind: 'observed', tabId: localTab.id, hostId: 'local' }]
            }}
          />
        </div>
      )
      fireEvent.keyDown(screen.getByRole('button', { name: 'Seen in Current terminal' }), {
        key,
        metaKey,
        ctrlKey
      })
      expect(parent).toHaveBeenCalledOnce()
    }
  )
  it('prevents plain Enter from submitting the parent while opening an observation', () => {
    const parent = vi.fn()
    render(
      <div onKeyDown={parent}>
        <WorkspaceAttachmentOrigins
          workspace={workspace}
          item={{
            provider: 'github',
            type: 'pr',
            number: 23,
            origins: [{ kind: 'observed', tabId: localTab.id, hostId: 'local' }]
          }}
        />
      </div>
    )
    fireEvent.keyDown(screen.getByRole('button', { name: 'Seen in Current terminal' }), {
      key: 'Enter'
    })
    expect(parent).not.toHaveBeenCalled()
  })
  it('uses the live tab name while preserving evidence semantics', () => {
    render(
      <WorkspaceAttachmentOrigins
        workspace={workspace}
        item={{
          provider: 'github',
          type: 'pr',
          number: 23,
          origins: [{ kind: 'observed', tabId: localTab.id, hostId: 'local', label: 'Old name' }]
        }}
      />
    )
    expect(screen.getByRole('button', { name: 'Seen in Current terminal' })).toBeTruthy()
    expect(screen.queryByText('Seen in Old name')).toBeNull()
  })
})
