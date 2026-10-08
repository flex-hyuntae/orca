import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'
import { makeWorktree } from '../../store/slices/worktrees-slice-test-fixtures'
import {
  buildWorkspaceAttachmentEdits,
  canUseWorkspaceReviewForChecks
} from './worktree-attachment-editing'

function repo(host: string): Repo {
  return {
    id: 'repo',
    path: '/repo',
    displayName: 'Repo',
    badgeColor: '',
    addedAt: 0,
    gitRemoteIdentity: {
      canonicalKey: `${host}/acme/repo`,
      remoteName: 'origin',
      remoteUrl: `https://${host}/acme/repo.git`
    }
  }
}
const review: WorkspaceAttachment = { provider: 'github', type: 'pr', number: 1 }

describe('workspace attachment editing', () => {
  it('requires a compatible provider before a bare review can drive checks', () => {
    expect(canUseWorkspaceReviewForChecks(review, repo('github.com'))).toBe(true)
    expect(
      canUseWorkspaceReviewForChecks(
        { provider: 'gitlab', type: 'mr', number: 1 },
        repo('github.com')
      )
    ).toBe(false)
    expect(canUseWorkspaceReviewForChecks(review, repo('git.example.com'))).toBe(false)
    expect(canUseWorkspaceReviewForChecks(review, repo('git.example.com'), 'github')).toBe(true)
    expect(canUseWorkspaceReviewForChecks(review, undefined)).toBe(false)
  })

  it('preserves changed origins and concurrent metadata without resurrecting removed references', () => {
    const initial = [{ ...review, title: 'Old' }]
    const draft = [
      { ...review, title: 'Old', origins: [{ kind: 'assigned' as const, tabId: 'tab' }] }
    ]
    const live = makeWorktree({
      id: 'repo::/work',
      repoId: 'repo',
      linkedItems: [{ ...review, title: 'Fresh' }]
    })
    const updates = buildWorkspaceAttachmentEdits({
      initial,
      draft,
      live,
      activeReviewKey: null,
      initialActiveReviewKey: null
    })
    expect(updates.linkedItems?.[0]).toMatchObject({ title: 'Fresh', origins: draft[0].origins })
    expect(
      buildWorkspaceAttachmentEdits({
        initial,
        draft,
        live: makeWorktree({ id: 'repo::/work', repoId: 'repo', linkedItems: [] }),
        activeReviewKey: null,
        initialActiveReviewKey: null
      }).linkedItems
    ).toEqual([])
  })
  it('writes an explicit empty selection when the only eligible review is removed', () => {
    const mr: WorkspaceAttachment = { provider: 'gitlab', type: 'mr', number: 2 }
    const initial = [review, mr]
    const updates = buildWorkspaceAttachmentEdits({
      initial,
      draft: [mr],
      live: makeWorktree({ id: 'repo::/work', repoId: 'repo', linkedItems: initial, linkedPR: 1 }),
      activeReviewKey: null,
      initialActiveReviewKey: 'old-active'
    })
    expect(updates).toMatchObject({
      linkedItems: [mr],
      linkedPR: null,
      linkedGitLabMR: null,
      linkedBitbucketPR: null,
      linkedAzureDevOpsPR: null,
      linkedGiteaPR: null
    })
  })
})
