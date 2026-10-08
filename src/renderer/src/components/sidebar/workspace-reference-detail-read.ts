import { useAppStore } from '@/store'
import { readHostedReviewForRepo } from '@/lib/hosted-review-repo-read'
import { canReadWorkspaceReferenceReview } from './workspace-reference-review-source'
import { isWorkspaceRepositoryAttachment } from './worktree-attachment-editing'
import {
  matchesWorkspaceReferenceUrl,
  getWorkspaceReferenceLinearWorkspaceId,
  matchWorkspaceReferenceReview,
  type WorkspaceReferenceDetails,
  type WorkspaceReferenceRequest
} from './workspace-reference-details'

export async function readWorkspaceReferenceDetails(
  request: WorkspaceReferenceRequest
): Promise<WorkspaceReferenceDetails | null> {
  const { item, workspace, repo, sourceContext } = request
  const state = useAppStore.getState()
  if (item.type !== 'issue') {
    if (!repo || !canReadWorkspaceReferenceReview(request, request.knownProvider)) {
      return null
    }
    const review = await readHostedReviewForRepo(repo, state.settings, {
      branch: workspace.branch ?? '',
      admissionTier: request.admissionTier ?? 'interactive',
      linkedGitHubPR: item.provider === 'github' ? item.number : null,
      linkedGitLabMR: item.provider === 'gitlab' ? item.number : null,
      linkedBitbucketPR: item.provider === 'bitbucket' ? item.number : null,
      linkedAzureDevOpsPR: item.provider === 'azure-devops' ? item.number : null,
      linkedGiteaPR: item.provider === 'gitea' ? item.number : null
    })
    return review && matchWorkspaceReferenceReview(item, review)
      ? { title: review.title, url: review.url, review }
      : null
  }
  const identifier = item.identifier ?? item.linearIdentifier ?? item.jiraIdentifier
  if (item.provider === 'linear' && identifier && sourceContext?.provider === 'linear') {
    const workspaceId = getWorkspaceReferenceLinearWorkspaceId(
      item.linearWorkspaceId,
      sourceContext
    )
    const issue = await state.fetchLinearIssue(identifier, workspaceId, { sourceContext })
    return issue &&
      issue.identifier.toLowerCase() === identifier.toLowerCase() &&
      matchesWorkspaceReferenceUrl(item, issue.url) &&
      (workspaceId === 'all' || issue.workspaceId === workspaceId)
      ? {
          title: issue.title,
          url: issue.url,
          stateName: issue.state.name,
          stateType: issue.state.type
        }
      : null
  }
  if (item.provider === 'jira' && identifier && sourceContext?.provider === 'jira') {
    const identity = sourceContext.providerIdentity
    const siteId = identity?.provider === 'jira' ? identity.siteId : null
    if (!siteId) {
      return null
    }
    const issue = await state.lookupJiraIssueSummary(sourceContext, identifier, siteId)
    return issue &&
      issue.key.toLowerCase() === identifier.toLowerCase() &&
      issue.siteId === siteId &&
      matchesWorkspaceReferenceUrl(item, issue.url)
      ? {
          title: issue.title,
          url: issue.url,
          stateName: issue.status.name,
          stateType:
            issue.status.categoryKey === 'done'
              ? 'completed'
              : issue.status.categoryKey === 'indeterminate'
                ? 'started'
                : issue.status.categoryKey === 'new'
                  ? 'unstarted'
                  : undefined
        }
      : null
  }
  if (
    item.provider === 'github' &&
    repo &&
    sourceContext?.provider === 'github' &&
    isWorkspaceRepositoryAttachment(item, repo)
  ) {
    const issue = await state.fetchIssue(repo.path, item.number, { repoId: repo.id, sourceContext })
    return issue && issue.number === item.number && matchesWorkspaceReferenceUrl(item, issue.url)
      ? { title: issue.title, url: issue.url, issueState: issue.state }
      : null
  }
  return null
}
