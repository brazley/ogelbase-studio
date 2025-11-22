import { MoreVertical, Shield, ShieldAlert, ShieldCheck, User } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useParams } from 'common'
import AlertError from 'components/ui/AlertError'
import { GenericSkeletonLoader } from 'components/ui/ShimmeringLoader'
import {
  PlatformMember,
  usePlatformMembersQuery,
} from 'data/platform-members/platform-members-query'
import { useRemovePlatformMemberMutation } from 'data/platform-members/platform-member-remove-mutation'
import { useUpdatePlatformMemberMutation } from 'data/platform-members/platform-member-update-mutation'
import { useProfile } from 'lib/profile'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select_Shadcn_,
  SelectContent_Shadcn_,
  SelectGroup_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from 'ui'

const ROLE_CONFIGS = {
  owner: {
    label: 'Owner',
    color: 'amber' as const,
    icon: ShieldAlert,
  },
  admin: {
    label: 'Admin',
    color: 'blue' as const,
    icon: ShieldCheck,
  },
  developer: {
    label: 'Developer',
    color: 'green' as const,
    icon: Shield,
  },
  read_only: {
    label: 'Read Only',
    color: 'gray' as const,
    icon: User,
  },
} as const

interface RoleBadgeProps {
  role: PlatformMember['role']
}

const RoleBadge = ({ role }: RoleBadgeProps) => {
  const config = ROLE_CONFIGS[role]
  const Icon = config.icon

  return (
    <Badge variant="outline" className={cn('gap-1.5 font-normal')}>
      <Icon size={12} />
      {config.label}
    </Badge>
  )
}

interface MemberActionsProps {
  member: PlatformMember
  currentUserId: string
  currentUserRole: PlatformMember['role'] | null
  onUpdateRole: (memberId: string, role: PlatformMember['role']) => void
  onRemove: (memberId: string) => void
}

const MemberActions = ({
  member,
  currentUserId,
  currentUserRole,
  onUpdateRole,
  onRemove,
}: MemberActionsProps) => {
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [newRole, setNewRole] = useState<PlatformMember['role']>(member.role)

  const isCurrentUser = member.user_id === currentUserId
  const canEdit = currentUserRole === 'owner' || currentUserRole === 'admin'
  const canEditThisMember = canEdit && !isCurrentUser

  // Only owners can manage owners
  const canChangeOwner = currentUserRole === 'owner'
  const isTargetOwner = member.role === 'owner'

  if (!canEditThisMember) {
    return null
  }

  const handleUpdateRole = () => {
    if (newRole === member.role) {
      setShowRoleDialog(false)
      return
    }
    onUpdateRole(member.id, newRole)
    setShowRoleDialog(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="text" className="px-1" icon={<MoreVertical size={16} />} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Manage member</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isTargetOwner && !canChangeOwner}
            onClick={() => setShowRoleDialog(true)}
          >
            Change role
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={isTargetOwner && !canChangeOwner}
            onClick={() => setShowRemoveDialog(true)}
          >
            Remove member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Change Role Dialog */}
      <AlertDialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change member role</AlertDialogTitle>
            <AlertDialogDescription>
              Update the role for {member.email}. This will change their access level immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Select_Shadcn_ value={newRole} onValueChange={(v) => setNewRole(v as any)}>
              <SelectTrigger_Shadcn_>
                <SelectValue_Shadcn_ />
              </SelectTrigger_Shadcn_>
              <SelectContent_Shadcn_>
                <SelectGroup_Shadcn_>
                  {Object.entries(ROLE_CONFIGS).map(([value, config]) => (
                    <SelectItem_Shadcn_
                      key={value}
                      value={value}
                      disabled={value === 'owner' && !canChangeOwner}
                    >
                      {config.label}
                    </SelectItem_Shadcn_>
                  ))}
                </SelectGroup_Shadcn_>
              </SelectContent_Shadcn_>
            </Select_Shadcn_>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateRole}>
              Update role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {member.email} from this organization? They will lose
              access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                onRemove(member.id)
                setShowRemoveDialog(false)
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export const TeamMembersList = () => {
  const { slug } = useParams()
  const { profile } = useProfile()

  const {
    data: members,
    error,
    isLoading,
    isError,
  } = usePlatformMembersQuery({ slug })

  const { mutate: updateRole } = useUpdatePlatformMemberMutation()
  const { mutate: removeMember } = useRemovePlatformMemberMutation()

  const currentUser = members?.find((m) => String(m.user_id) === String(profile?.id))
  const currentUserRole = currentUser?.role || null

  const handleUpdateRole = (memberId: string, role: PlatformMember['role']) => {
    if (!slug) return
    updateRole({ slug, member_id: memberId, role })
  }

  const handleRemoveMember = (memberId: string) => {
    if (!slug) return
    removeMember({ slug, member_id: memberId })
  }

  if (isLoading) {
    return <GenericSkeletonLoader />
  }

  if (isError) {
    return <AlertError error={error} subject="Failed to load team members" />
  }

  if (!members || members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-foreground-light">No team members yet</p>
        <p className="text-sm text-foreground-lighter mt-1">
          Invite members to collaborate on this organization
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const isCurrentUser = String(member.user_id) === String(profile?.id)
            const displayName =
              member.first_name || member.last_name
                ? `${member.first_name || ''} ${member.last_name || ''}`.trim()
                : member.username || member.email

            return (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full bg-surface-100 border border-overlay',
                        'flex items-center justify-center text-foreground-lighter'
                      )}
                    >
                      <User size={16} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{displayName}</span>
                      {isCurrentUser && (
                        <Badge variant="outline" className="w-fit mt-1">
                          You
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-foreground-light">{member.email}</TableCell>
                <TableCell>
                  <RoleBadge role={member.role} />
                </TableCell>
                <TableCell>
                  <MemberActions
                    member={member}
                    currentUserId={String(profile?.id || '')}
                    currentUserRole={currentUserRole}
                    onUpdateRole={handleUpdateRole}
                    onRemove={handleRemoveMember}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="px-6 py-3 bg-surface-100 border-t">
        <p className="text-sm text-foreground-light">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </p>
      </div>
    </div>
  )
}
