import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { WorkspaceAttachment, Worktree } from '../../../../shared/worktree/types'
import { normalizeTaskSourceContext } from '../../../../shared/task-source-context'
import {
  appendWorkspaceAttachment,
  getWorkspaceAttachmentSourceContext,
  isWorkspaceAttachmentLinked,
  matchesWorkspaceAttachmentQuery,
  workspaceAttachmentFromSourceRow
} from './workspace-attachment-source-result'

const repo: Repo = {
  id: 'repo',
  path: '/repo',
  displayName: 'Orca',
  badgeColor: '',
  addedAt: 1,
  connectionId: 'remote'
}
const worktree: Worktree = {
  id: 'workspace',
  repoId: 'repo',
  path: '/repo/feature',
  displayName: 'Feature',
  branch: 'feature',
  head: 'abc',
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  isBare: false,
  isMainWorktree: false,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 1
}
const github = normalizeTaskSourceContext({
  provider: 'github',
  projectId: 'repo',
  hostId: 'local'
})
const review: WorkspaceAttachment = {
  provider: 'github',
  type: 'pr',
  number: 7,
  url: 'https://github.com/acme/orca/pull/7',
  repoId: 'repo'
}

describe('attachment source conversion', () => {
  it('uses legacy SSH ownership and preserves the saved provider source', () => {
    expect(getWorkspaceAttachmentSourceContext('gitlab', repo, worktree)?.hostId).toBe('ssh:remote')
    const stored = normalizeTaskSourceContext({
      provider: 'linear',
      projectId: 'other',
      hostId: 'runtime:saved'
    })
    const saved = { ...worktree, linkedTaskSourceContext: stored }
    expect(getWorkspaceAttachmentSourceContext('linear', repo, saved)).toBe(stored)
    expect(getWorkspaceAttachmentSourceContext('github', repo, saved)?.projectId).toBe('repo')
    expect(getWorkspaceAttachmentSourceContext('github', repo, saved)?.hostId).toBe('ssh:remote')
  })
  it('binds searched reviews to the source repository and retains their title', () => {
    const item = workspaceAttachmentFromSourceRow(
      {
        kind: 'github',
        value: 'github:7',
        item: {
          id: '7',
          repoId: 'repo',
          type: 'pr',
          number: 7,
          title: 'Seven',
          state: 'open',
          url: review.url ?? '',
          labels: [],
          updatedAt: '2026-10-05',
          author: null
        }
      },
      { github, gitlab: null, linear: null, jira: null }
    )
    expect(item).toMatchObject({
      title: 'Seven',
      number: 7,
      taskSourceContext: { providerIdentity: { provider: 'github', owner: 'acme', repo: 'orca' } }
    })
  })
  it('recognizes a rich URL whose older context has no provider identity', () => {
    const old = { ...review, taskSourceContext: github ?? undefined }
    const enriched = {
      ...review,
      taskSourceContext: github
        ? {
            ...github,
            providerIdentity: { provider: 'github' as const, owner: 'acme', repo: 'orca' }
          }
        : undefined
    }
    expect(isWorkspaceAttachmentLinked([old], enriched)).toBe(true)
    expect(
      isWorkspaceAttachmentLinked([old], {
        ...enriched,
        taskSourceContext:
          normalizeTaskSourceContext({
            provider: 'github',
            projectId: 'other',
            hostId: 'runtime:other'
          }) ?? undefined
      })
    ).toBe(false)
    expect(
      isWorkspaceAttachmentLinked([old], {
        ...enriched,
        url: 'https://github.com/other/orca/pull/7'
      })
    ).toBe(false)
  })
  it('enriches a legacy review without adding a duplicate', () => {
    const bare: WorkspaceAttachment = { provider: 'github', type: 'pr', number: 7 }
    const result = appendWorkspaceAttachment([bare], review)
    expect(result).toEqual([review])
  })
  it('only enriches the same symbolic identifier and URL source', () => {
    const task: WorkspaceAttachment = {
      provider: 'linear',
      type: 'issue',
      number: 0,
      identifier: 'STA-71'
    }
    expect(matchesWorkspaceAttachmentQuery(task, { ...task, identifier: 'STA-710' })).toBe(false)
    expect(matchesWorkspaceAttachmentQuery(task, { ...task, identifier: 'sta-71' })).toBe(true)
    expect(
      matchesWorkspaceAttachmentQuery(review, {
        ...review,
        url: 'https://github.com/other/orca/pull/7'
      })
    ).toBe(false)
    expect(
      matchesWorkspaceAttachmentQuery(
        { provider: 'github', type: 'pr', number: 7 },
        { ...review, type: 'issue' }
      )
    ).toBe(true)
  })
})
