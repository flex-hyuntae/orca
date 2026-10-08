import { normalizeGitHubPRSuppressionUpdate } from '../../../../../../shared/worktree/github-pr-suppression'
import type { WorktreeMeta } from '../../../../../../shared/worktree/meta-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { clearOlderHostedReviewLinksForReplacement } from './hosted-review-link-mutation'
import { normalizeWorkspaceAttachmentUpdate } from '../../../../../../shared/workspace-attachments'

export function normalizeHostedReviewLinkReplacementUpdates(
  updates: Partial<WorktreeMeta>,
  existingWorktree?: Worktree
): Partial<WorktreeMeta> {
  const attachmentUpdates = normalizeWorkspaceAttachmentUpdate(existingWorktree, updates)
  const replacementUpdates = existingWorktree
    ? clearOlderHostedReviewLinksForReplacement(attachmentUpdates, existingWorktree)
    : attachmentUpdates
  return normalizeGitHubPRSuppressionUpdate(replacementUpdates)
}
