import { parseGitHubIssueOrPRLink } from '../../../shared/github/links'
import { githubRepoIdentityKey } from '../../../shared/github/repository-identity-key'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import { getWorkspaceAttachments } from '../../../shared/workspace-attachments'
import type { Worktree } from '../../../shared/worktree/types'

type GitHubWorkItemType = GitHubWorkItem['type']

export function findGithubWorkItemWorkspaceAttachment(
  worktrees: readonly Worktree[],
  repoId: string | null | undefined,
  type: GitHubWorkItemType,
  number: number,
  sourceUrl?: string
): Worktree | null {
  if (!repoId) {
    return null
  }

  const source = sourceUrl ? parseGitHubIssueOrPRLink(sourceUrl) : null
  return (
    worktrees.find((worktree) => {
      if (worktree.isArchived) {
        return false
      }

      return getWorkspaceAttachments(worktree).some((item) => {
        if (item.provider !== 'github' || item.type !== type || item.number !== number) {
          return false
        }
        const linked = item.url ? parseGitHubIssueOrPRLink(item.url) : null
        if (source && linked) {
          return githubRepoIdentityKey(source.slug) === githubRepoIdentityKey(linked.slug)
        }
        if (linked && !source) {
          return item.repoId === repoId && worktree.repoId === repoId
        }
        return worktree.repoId === repoId && (!item.repoId || item.repoId === repoId)
      })
    }) ?? null
  )
}

export function findGithubPrWorkspaceAttachment(
  worktrees: readonly Worktree[],
  repoId: string | null | undefined,
  prNumber: number,
  sourceUrl?: string
): Worktree | null {
  return findGithubWorkItemWorkspaceAttachment(worktrees, repoId, 'pr', prNumber, sourceUrl)
}

export function findGithubIssueWorkspaceAttachment(
  worktrees: readonly Worktree[],
  repoId: string | null | undefined,
  issueNumber: number,
  sourceUrl?: string
): Worktree | null {
  return findGithubWorkItemWorkspaceAttachment(worktrees, repoId, 'issue', issueNumber, sourceUrl)
}
