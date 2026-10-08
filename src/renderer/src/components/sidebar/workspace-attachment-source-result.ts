import type { Repo } from '../../../../shared/repo-types'
import type { WorkspaceAttachment, Worktree } from '../../../../shared/worktree/types'
import {
  buildTaskSourceContextFromRepo,
  normalizeTaskSourceContext,
  type TaskSourceContext,
  type TaskProvider
} from '../../../../shared/task-source-context'
import { parseLinearIssueInput } from '../../../../shared/linear/links'
import { parseGitHubIssueOrPRLink } from '../../../../shared/github/links'
import { parseGitLabIssueOrMRLink } from '../../../../shared/new-workspace/gitlab-links'
import {
  getWorkspaceAttachmentKey,
  getWorkspaceAttachmentUrlScope,
  normalizeWorkspaceAttachments
} from '../../../../shared/workspace-attachments'
import { matchesWorkspaceAttachmentIdentity } from '../../../../shared/workspace-attachment-normalization'
import type { RowEntry } from '../new-workspace/smart-workspace-name-field-model'

export function getWorkspaceAttachmentSourceContext(
  provider: TaskProvider,
  repo: Repo | undefined,
  workspace: Worktree | undefined
): TaskSourceContext | null {
  const stored = workspace?.linkedTaskSourceContext
  if (stored?.provider === provider) {
    return stored
  }
  if (repo) {
    return buildTaskSourceContextFromRepo({
      provider,
      projectId: workspace?.projectId ?? repo.id,
      repo: { ...repo, executionHostId: workspace?.hostId ?? repo.executionHostId },
      projectHostSetupId: workspace?.projectHostSetupId
    })
  }
  return workspace
    ? normalizeTaskSourceContext({
        provider,
        projectId: workspace.projectId ?? workspace.repoId,
        hostId: workspace.hostId,
        projectHostSetupId: workspace.projectHostSetupId
      })
    : null
}

export function workspaceAttachmentFromSourceRow(
  row: RowEntry,
  contexts: {
    github: TaskSourceContext | null
    gitlab: TaskSourceContext | null
    linear: TaskSourceContext | null
    jira: TaskSourceContext | null
  }
): WorkspaceAttachment | null {
  if (row.kind === 'github' || row.kind === 'gitlab') {
    const item = row.item
    const context = row.kind === 'github' ? contexts.github : contexts.gitlab
    const githubUrl = row.kind === 'github' ? parseGitHubIssueOrPRLink(item.url) : null
    const gitlabUrl = row.kind === 'gitlab' ? parseGitLabIssueOrMRLink(item.url) : null
    const sourceContext = context
      ? {
          ...context,
          providerIdentity: githubUrl
            ? { provider: 'github' as const, ...githubUrl.slug }
            : gitlabUrl
              ? {
                  provider: 'gitlab' as const,
                  webUrl: `${new URL(item.url).origin}/${gitlabUrl.slug.path}`
                }
              : context.providerIdentity
        }
      : undefined
    return {
      provider: row.kind,
      type: item.type,
      number: item.number,
      title: item.title,
      url: item.url,
      repoId: item.repoId,
      taskSourceContext: sourceContext
    }
  }
  if (row.kind === 'linear') {
    const issue = row.issue
    const organization = parseLinearIssueInput(issue.url)?.organizationUrlKey
    return {
      provider: 'linear',
      type: 'issue',
      number: 0,
      identifier: issue.identifier,
      linearIdentifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      linearWorkspaceId: issue.workspaceId,
      linearOrganizationUrlKey: organization,
      taskSourceContext: contexts.linear
        ? {
            ...contexts.linear,
            providerIdentity: {
              provider: 'linear',
              workspaceId: issue.workspaceId,
              workspaceName: issue.workspaceName,
              teamId: issue.team.id,
              teamKey: issue.team.key
            }
          }
        : undefined
    }
  }
  if (row.kind === 'jira') {
    return {
      provider: 'jira',
      type: 'issue',
      number: 0,
      identifier: row.issue.key,
      jiraIdentifier: row.issue.key,
      title: row.issue.title,
      url: row.issue.url,
      taskSourceContext: contexts.jira ?? undefined
    }
  }
  return null
}

export function matchesWorkspaceAttachmentQuery(
  query: WorkspaceAttachment,
  result: WorkspaceAttachment
): boolean {
  if (query.provider !== result.provider || query.number !== result.number) {
    return false
  }
  const identifier = query.identifier ?? query.linearIdentifier ?? query.jiraIdentifier
  const resultIdentifier = result.identifier ?? result.linearIdentifier ?? result.jiraIdentifier
  if (identifier && identifier.toLowerCase() !== resultIdentifier?.toLowerCase()) {
    return false
  }
  return (
    !query.url ||
    (query.type === result.type &&
      getWorkspaceAttachmentUrlScope(query) === getWorkspaceAttachmentUrlScope(result))
  )
}

export function isWorkspaceAttachmentLinked(
  items: readonly WorkspaceAttachment[],
  candidate: WorkspaceAttachment
): boolean {
  return items.some((item) => {
    if (
      matchesWorkspaceAttachmentIdentity(candidate, item) ||
      matchesWorkspaceAttachmentIdentity(item, candidate)
    ) {
      return true
    }
    const sameReference =
      item.provider === candidate.provider &&
      item.type === candidate.type &&
      item.number === candidate.number &&
      (item.identifier ?? item.linearIdentifier ?? item.jiraIdentifier) ===
        (candidate.identifier ?? candidate.linearIdentifier ?? candidate.jiraIdentifier)
    const scope = getWorkspaceAttachmentUrlScope(item)
    if (!sameReference || !scope || scope !== getWorkspaceAttachmentUrlScope(candidate)) {
      return false
    }
    const oldContext = item.taskSourceContext
    const newContext = candidate.taskSourceContext
    return (
      !oldContext ||
      !newContext ||
      (oldContext.hostId === newContext.hostId &&
        oldContext.projectId === newContext.projectId &&
        (!oldContext.accountLabel ||
          !newContext.accountLabel ||
          oldContext.accountLabel === newContext.accountLabel))
    )
  })
}

export function appendWorkspaceAttachment(
  items: readonly WorkspaceAttachment[],
  item: WorkspaceAttachment,
  activeKey: string | null
): { items: WorkspaceAttachment[]; activeKey: string | null } {
  const selected = items.find((candidate) => getWorkspaceAttachmentKey(candidate) === activeKey)
  const normalized = normalizeWorkspaceAttachments([...items, item])
  const active = selected
    ? normalized.find((candidate) => matchesWorkspaceAttachmentIdentity(candidate, selected))
    : null
  return { items: normalized, activeKey: active ? getWorkspaceAttachmentKey(active) : activeKey }
}
