export const platformMemberKeys = {
  list: (slug: string | undefined) => ['platform-members', slug] as const,
  detail: (slug: string | undefined, memberId: string | undefined) =>
    ['platform-members', slug, memberId] as const,
}
