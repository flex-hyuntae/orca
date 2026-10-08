import { describe, expect, it } from 'vitest'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import { getWorkspaceAttachmentSourceLabel } from './workspace-attachment-source-label'

function source(
  provider: TaskSourceContext['provider'],
  providerIdentity: TaskSourceContext['providerIdentity'],
  accountLabel?: string
): TaskSourceContext {
  return {
    kind: 'task-source',
    provider,
    projectId: 'project-internal-id',
    hostId: 'runtime:host-internal-id',
    providerIdentity,
    accountLabel
  }
}

describe('workspace attachment source label', () => {
  it('distinguishes matching Linear identifiers across organizations and accounts', () => {
    const item: WorkspaceAttachment = {
      provider: 'linear',
      type: 'issue',
      number: 0,
      identifier: 'ENG-215',
      url: 'https://linear.app/acme/issue/ENG-215/title',
      taskSourceContext: source(
        'linear',
        {
          provider: 'linear',
          workspaceId: 'internal-workspace-id',
          workspaceName: 'Engineering'
        },
        'alice@example.com'
      )
    }
    expect(getWorkspaceAttachmentSourceLabel(item)).toBe('Engineering · acme · alice@example.com')
    expect(
      getWorkspaceAttachmentSourceLabel({
        ...item,
        url: 'https://linear.app/other/issue/ENG-215/title'
      })
    ).toBe('Engineering · other · alice@example.com')
    expect(
      getWorkspaceAttachmentSourceLabel({
        ...item,
        taskSourceContext: { ...item.taskSourceContext!, accountLabel: 'bob@example.com' }
      })
    ).toBe('Engineering · acme · bob@example.com')
  })

  it('distinguishes matching Jira identifiers across site paths and accounts', () => {
    const item: WorkspaceAttachment = {
      provider: 'jira',
      type: 'issue',
      number: 0,
      identifier: 'APP-18',
      url: 'https://jira.example.com/team/browse/APP-18',
      taskSourceContext: source(
        'jira',
        {
          provider: 'jira',
          siteId: 'internal-site-id',
          siteUrl: 'https://jira.example.com/team/'
        },
        'alice@example.com'
      )
    }
    expect(getWorkspaceAttachmentSourceLabel(item)).toBe(
      'jira.example.com/team · alice@example.com'
    )
    expect(
      getWorkspaceAttachmentSourceLabel({
        ...item,
        url: 'https://jira.example.com/other/browse/APP-18',
        taskSourceContext: undefined
      })
    ).toBe('jira.example.com/other')
  })

  it('reuses provider URL parsers for hosted repositories and nested GitLab groups', () => {
    expect(
      getWorkspaceAttachmentSourceLabel({
        provider: 'github',
        type: 'pr',
        number: 7,
        url: 'https://github.example.com/Owner/Repo/pull/7'
      })
    ).toBe('github.example.com/Owner/Repo')
    expect(
      getWorkspaceAttachmentSourceLabel({
        provider: 'github',
        type: 'issue',
        number: 7,
        url: 'https://github.com/Owner/Repo/issues/7'
      })
    ).toBe('Owner/Repo')
    expect(
      getWorkspaceAttachmentSourceLabel({
        provider: 'gitlab',
        type: 'issue',
        number: 7,
        url: 'https://gitlab.example.com/Group/Subgroup/Repo/-/work_items/7'
      })
    ).toBe('gitlab.example.com/Group/Subgroup/Repo')
  })

  it('uses known provider identity when older metadata has no URL', () => {
    expect(
      getWorkspaceAttachmentSourceLabel({
        provider: 'github',
        type: 'pr',
        number: 7,
        taskSourceContext: source('github', { provider: 'github', owner: 'acme', repo: 'orca' })
      })
    ).toBe('acme/orca')
    expect(
      getWorkspaceAttachmentSourceLabel({
        provider: 'gitlab',
        type: 'mr',
        number: 7,
        taskSourceContext: source('gitlab', {
          provider: 'gitlab',
          namespace: 'acme/team',
          project: 'orca'
        })
      })
    ).toBe('acme/team/orca')
  })

  it('uses the linked GitHub URL when an older stored repository identity differs', () => {
    expect(
      getWorkspaceAttachmentSourceLabel({
        provider: 'github',
        type: 'pr',
        number: 7,
        url: 'https://github.com/actual/repo/pull/7',
        taskSourceContext: source('github', { provider: 'github', owner: 'old', repo: 'repo' })
      })
    ).toBe('actual/repo')
  })

  it('falls back to URL scope for other reviews without exposing credentials or issue paths', () => {
    expect(
      getWorkspaceAttachmentSourceLabel({
        provider: 'bitbucket',
        type: 'pr',
        number: 7,
        url: 'https://bitbucket.org/Team/Repo/pull-requests/7?token=secret'
      })
    ).toBe('bitbucket.org/Team/Repo')
    expect(
      getWorkspaceAttachmentSourceLabel({
        provider: 'jira',
        type: 'issue',
        number: 0,
        identifier: 'APP-7',
        url: 'https://user:secret@jira.example.com/browse/APP-7'
      })
    ).toBeNull()
  })

  it('does not replace absent human labels with opaque runtime, workspace, or site identifiers', () => {
    expect(
      getWorkspaceAttachmentSourceLabel({
        provider: 'linear',
        type: 'issue',
        number: 0,
        identifier: 'ENG-7',
        linearWorkspaceId: 'opaque-workspace-id',
        taskSourceContext: source('linear', {
          provider: 'linear',
          workspaceId: 'opaque-workspace-id',
          workspaceName: '1a234567-1234-1234-1234-123456789abc'
        })
      })
    ).toBeNull()
    expect(
      getWorkspaceAttachmentSourceLabel({ provider: 'github', type: 'pr', number: 7 })
    ).toBeNull()
  })
})
