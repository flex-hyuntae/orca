// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { NormalizedSmartWorkspaceNameFieldProps } from './smart-workspace-name-field-model'
import { useSmartWorkspaceNameFieldFoundation } from './use-smart-workspace-name-field-foundation'
import { useSmartWorkspaceSecondarySearches } from './use-smart-workspace-secondary-searches'

const mocks = vi.hoisted(() => ({
  readStatus: vi.fn(),
  state: {
    addRepo: vi.fn(),
    checkLinearConnection: vi.fn(),
    linearStatus: { connected: false, viewer: null, selectedWorkspaceId: 'focused-workspace' },
    linearStatusChecked: true,
    settings: null,
    preflightStatus: null,
    preflightStatusChecked: true,
    preflightStatusContextKey: 'test',
    refreshPreflightStatus: vi.fn(),
    searchLinearIssues: vi.fn(async () => [])
  }
}))
vi.mock('@/runtime/runtime-linear-client', () => ({ linearStatus: mocks.readStatus }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)
}))
vi.mock('@/lib/local-preflight-context', () => ({
  getLocalPreflightContext: () => ({}),
  localPreflightContextKey: () => 'test'
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./use-jira-source-connection', () => ({
  useJiraSourceConnection: () => ({ status: null, loaded: false })
}))
vi.mock('./use-jira-url-source', () => ({ useJiraUrlSource: () => ({ intent: false }) }))

const source: TaskSourceContext = {
  kind: 'task-source',
  provider: 'linear',
  projectId: 'project-1',
  hostId: 'runtime:saved-host',
  repoId: null,
  providerIdentity: null,
  accountLabel: null
}

function props(context?: TaskSourceContext): NormalizedSmartWorkspaceNameFieldProps {
  return {
    repos: [],
    repoId: '',
    onRepoChange: vi.fn(),
    value: '',
    onValueChange: vi.fn(),
    onGitHubItemSelect: vi.fn(),
    onBranchSelect: vi.fn(),
    onLinearIssueSelect: vi.fn(),
    selectedSource: null,
    onClearSelectedSource: vi.fn(),
    jiraSourceContext: null,
    linearSourceContext: context,
    disabled: false,
    textOnly: false,
    branchesEnabled: false,
    repoBackedSourcesDisabled: true,
    repoBackedSearchRepos: [],
    allowCrossRepoProjectAdd: false,
    crossRepoSwitchTarget: 'task-source'
  }
}

describe('smart workspace explicit source connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.linearStatus = {
      connected: false,
      viewer: null,
      selectedWorkspaceId: 'focused-workspace'
    }
  })

  it('exposes Linear on a connected saved host while the focused runtime is disconnected', async () => {
    mocks.readStatus.mockResolvedValue({
      connected: true,
      viewer: null,
      selectedWorkspaceId: 'source-workspace'
    })
    const fieldProps = props(source)
    const { result } = renderHook(() => {
      const foundation = useSmartWorkspaceNameFieldFoundation(fieldProps)
      useSmartWorkspaceSecondarySearches({
        foundation,
        shouldQueryLinear: foundation.linearAvailable,
        linearQuery: 'launch',
        linearUrlIntent: null,
        linearUrlIntentOwnsInput: false,
        shouldQueryJira: false,
        jiraSearchQuery: null
      })
      return foundation
    })
    await waitFor(() =>
      expect(result.current.availableModes.some((mode) => mode.id === 'linear')).toBe(true)
    )
    expect(result.current.linearSourceContext).toBe(source)
    expect(result.current.linearStatus.connected).toBe(true)
    expect(mocks.state.searchLinearIssues).toHaveBeenCalledWith('launch', 12, {
      sourceContext: source,
      workspaceId: 'source-workspace'
    })
    expect(mocks.readStatus).toHaveBeenCalledWith(source)
    expect(mocks.state.checkLinearConnection).not.toHaveBeenCalled()
    expect(mocks.state.linearStatus.connected).toBe(false)
  })

  it('hides disconnected saved-host Linear even when the focused runtime is connected', async () => {
    mocks.state.linearStatus = { ...mocks.state.linearStatus, connected: true }
    mocks.readStatus.mockResolvedValue({ connected: false, viewer: null })
    const fieldProps = props(source)
    const { result } = renderHook(() => useSmartWorkspaceNameFieldFoundation(fieldProps))
    await waitFor(() => expect(result.current.linearStatusChecked).toBe(true))
    expect(result.current.availableModes.some((mode) => mode.id === 'linear')).toBe(false)
    expect(result.current.linearStatus.connected).toBe(false)
  })

  it('retains focused runtime status and avoids a new status read without an override', async () => {
    mocks.state.linearStatus = { ...mocks.state.linearStatus, connected: true }
    const fieldProps = props()
    const { result } = renderHook(() => useSmartWorkspaceNameFieldFoundation(fieldProps))
    await act(async () => {})
    expect(result.current.availableModes.some((mode) => mode.id === 'linear')).toBe(true)
    expect(result.current.linearStatus).toBe(mocks.state.linearStatus)
    expect(mocks.readStatus).not.toHaveBeenCalled()
  })
})
