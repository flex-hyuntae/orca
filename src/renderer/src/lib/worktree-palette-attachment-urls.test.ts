import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../shared/worktree/types'
import { referenceWorkspace } from '@/components/sidebar/workspace-reference-fixtures.test-support'
import {
  matchWorktreePaletteTaskUrl,
  parseCmdJTaskSourceUrl
} from './worktree-palette-task-url-match'

describe('multiple workspace task attachments', () => {
  it.each([
    { provider: 'github', type: 'pr', number: 42, url: 'https://github.com/acme/orca/pull/42' },
    {
      provider: 'gitlab',
      type: 'mr',
      number: 42,
      url: 'https://gitlab.com/team/orca/-/merge_requests/42'
    },
    {
      provider: 'linear',
      type: 'issue',
      number: 0,
      identifier: 'STA-42',
      url: 'https://linear.app/acme/issue/STA-42/title'
    },
    {
      provider: 'jira',
      type: 'issue',
      number: 0,
      identifier: 'STA-42',
      url: 'https://acme.atlassian.net/browse/STA-42'
    }
  ] as const)('matches secondary $provider links by their full URL', (attachment) => {
    const intent = parseCmdJTaskSourceUrl(attachment.url)
    if (!intent) {
      throw new Error('Fixture URL should parse')
    }
    const worktree = { ...referenceWorkspace, linkedPR: 1, linkedItems: [attachment] }
    expect(matchWorktreePaletteTaskUrl({ worktree, intent })).not.toBeNull()
  })
  it('does not match a same-number review in another repository', () => {
    const intent = parseCmdJTaskSourceUrl('https://github.com/other/project/pull/42')
    if (!intent) {
      throw new Error('Fixture URL should parse')
    }
    const worktree: Worktree = {
      ...referenceWorkspace,
      linkedItems: [
        { provider: 'github', type: 'pr', number: 42, url: 'https://github.com/acme/orca/pull/42' }
      ]
    }
    expect(matchWorktreePaletteTaskUrl({ worktree, intent })).toBeNull()
  })
})
