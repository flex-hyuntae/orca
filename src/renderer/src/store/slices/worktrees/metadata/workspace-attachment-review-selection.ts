import type { WorktreeMeta } from '../../../../../../shared/worktree/meta-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getHostedReviewLinkForMetaRefresh } from './hosted-review-link-mutation'

const REVIEW_SLOTS = [
  'linkedPR',
  'linkedGitLabMR',
  'linkedBitbucketPR',
  'linkedAzureDevOpsPR',
  'linkedGiteaPR'
] as const

export function hasExplicitWorkspaceReviewSelection(updates: Partial<WorktreeMeta>): boolean {
  return (
    REVIEW_SLOTS.some((slot) => typeof updates[slot] === 'number' && updates[slot] > 0) ||
    REVIEW_SLOTS.every((slot) => updates[slot] === null)
  )
}

export function getWorkspaceReviewRefreshHints(
  updates: Partial<WorktreeMeta>,
  workspace: Worktree | undefined
) {
  return {
    linkedGitHubPR: getHostedReviewLinkForMetaRefresh(updates, workspace, 'linkedPR'),
    linkedGitLabMR: getHostedReviewLinkForMetaRefresh(updates, workspace, 'linkedGitLabMR'),
    linkedBitbucketPR: getHostedReviewLinkForMetaRefresh(updates, workspace, 'linkedBitbucketPR'),
    linkedAzureDevOpsPR: getHostedReviewLinkForMetaRefresh(
      updates,
      workspace,
      'linkedAzureDevOpsPR'
    ),
    linkedGiteaPR: getHostedReviewLinkForMetaRefresh(updates, workspace, 'linkedGiteaPR')
  }
}
