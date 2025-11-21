import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import * as z from 'zod'

import { useParams } from 'common'
import { useInvitePlatformMemberMutation } from 'data/platform-members/platform-member-invite-mutation'
import { usePlatformMembersQuery } from 'data/platform-members/platform-members-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogSection,
  DialogSectionSeparator,
  DialogTitle,
  DialogTrigger,
  FormControl_Shadcn_,
  FormField_Shadcn_,
  Form_Shadcn_,
  Input_Shadcn_,
  SelectContent_Shadcn_,
  SelectGroup_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
  Select_Shadcn_,
} from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'

const ROLE_OPTIONS = [
  {
    value: 'owner',
    label: 'Owner',
    description: 'Full access to organization and all projects',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Manage organization settings and members',
  },
  {
    value: 'developer',
    label: 'Developer',
    description: 'Access to projects and development features',
  },
  {
    value: 'read_only',
    label: 'Read Only',
    description: 'View-only access to projects',
  },
] as const

const FormSchema = z.object({
  email: z.string().email('Must be a valid email address').min(1, 'Email is required'),
  role: z.enum(['owner', 'admin', 'developer', 'read_only']),
})

type FormValues = z.infer<typeof FormSchema>

interface InviteUserDialogProps {
  trigger?: React.ReactNode
  canInvite?: boolean
}

export const InviteUserDialog = ({ trigger, canInvite = true }: InviteUserDialogProps) => {
  const { slug } = useParams()
  const [open, setOpen] = useState(false)

  const { data: members } = usePlatformMembersQuery({ slug })
  const { mutate: inviteMember, isLoading } = useInvitePlatformMemberMutation()

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: '',
      role: 'developer',
    },
  })

  const onSubmit = (values: FormValues) => {
    if (!slug) return

    // Check if user already exists
    const existingMember = members?.find(
      (m) => m.email.toLowerCase() === values.email.toLowerCase()
    )

    if (existingMember) {
      return toast.error('User is already a member of this organization')
    }

    inviteMember(
      {
        slug,
        email: values.email.toLowerCase(),
        role: values.role,
      },
      {
        onSuccess: () => {
          toast.success(`Invitation sent to ${values.email}`)
          setOpen(false)
          form.reset()
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button type="primary" disabled={!canInvite}>
            Invite member
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="medium">
        <DialogHeader>
          <DialogTitle>Invite a member to this organization</DialogTitle>
        </DialogHeader>

        <DialogSectionSeparator />

        <Form_Shadcn_ {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogSection className="flex flex-col gap-y-4 pb-2">
              <FormField_Shadcn_
                name="email"
                control={form.control}
                render={({ field }) => (
                  <FormItemLayout
                    label="Email address"
                    description="Enter the email address of the person you want to invite"
                  >
                    <FormControl_Shadcn_>
                      <Input_Shadcn_
                        {...field}
                        autoFocus
                        type="email"
                        placeholder="user@example.com"
                        disabled={isLoading}
                        autoComplete="off"
                      />
                    </FormControl_Shadcn_>
                  </FormItemLayout>
                )}
              />

              <FormField_Shadcn_
                name="role"
                control={form.control}
                render={({ field }) => (
                  <FormItemLayout
                    label="Member role"
                    description="Choose the access level for this member"
                  >
                    <FormControl_Shadcn_>
                      <Select_Shadcn_
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isLoading}
                      >
                        <SelectTrigger_Shadcn_ className="capitalize">
                          <SelectValue_Shadcn_ />
                        </SelectTrigger_Shadcn_>
                        <SelectContent_Shadcn_>
                          <SelectGroup_Shadcn_>
                            {ROLE_OPTIONS.map((option) => (
                              <SelectItem_Shadcn_
                                key={option.value}
                                value={option.value}
                                className="flex flex-col items-start"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium">{option.label}</span>
                                  <span className="text-xs text-foreground-lighter">
                                    {option.description}
                                  </span>
                                </div>
                              </SelectItem_Shadcn_>
                            ))}
                          </SelectGroup_Shadcn_>
                        </SelectContent_Shadcn_>
                      </Select_Shadcn_>
                    </FormControl_Shadcn_>
                  </FormItemLayout>
                )}
              />
            </DialogSection>

            <DialogSectionSeparator />

            <DialogSection className="pt-0 flex gap-2 justify-end">
              <Button type="default" onClick={() => setOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={isLoading}>
                Send invitation
              </Button>
            </DialogSection>
          </form>
        </Form_Shadcn_>
      </DialogContent>
    </Dialog>
  )
}
