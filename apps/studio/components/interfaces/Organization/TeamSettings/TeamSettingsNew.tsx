import { useParams } from 'common'
import {
  ScaffoldActionsContainer,
  ScaffoldActionsGroup,
  ScaffoldContainer,
  ScaffoldFilterAndContent,
  ScaffoldSection,
  ScaffoldSectionContent,
  ScaffoldTitle,
} from 'components/layouts/Scaffold'
import { DocsButton } from 'components/ui/DocsButton'
import { usePlatformMembersQuery } from 'data/platform-members'
import { DOCS_URL } from 'lib/constants'
import { useProfile } from 'lib/profile'
import { InviteUserDialog } from './InviteUserDialog'
import { TeamMembersList } from './TeamMembersList'

export const TeamSettingsNew = () => {
  const { slug } = useParams()
  const { profile } = useProfile()

  const { data: members } = usePlatformMembersQuery({ slug })
  const currentUser = members?.find((m) => m.user_id === profile?.id)
  const canInvite = currentUser?.role === 'owner' || currentUser?.role === 'admin'

  return (
    <ScaffoldContainer>
      <ScaffoldSection isFullWidth className="!py-8 gap-y-8">
        <ScaffoldTitle>Team Members</ScaffoldTitle>
        <ScaffoldFilterAndContent>
          <ScaffoldActionsContainer className="w-full flex-col md:flex-row gap-2 justify-between">
            <div className="flex-1" />
            <ScaffoldActionsGroup className="w-full md:w-auto">
              <DocsButton href={`${DOCS_URL}/guides/platform/access-control`} />
              <InviteUserDialog canInvite={canInvite} />
            </ScaffoldActionsGroup>
          </ScaffoldActionsContainer>

          <ScaffoldSectionContent className="w-full">
            <TeamMembersList />
          </ScaffoldSectionContent>
        </ScaffoldFilterAndContent>
      </ScaffoldSection>
    </ScaffoldContainer>
  )
}
