export interface PendingInvite {
  groupName: string;
  groupId: string;
  orgName: string;
  orgId: string;
  userEmail: string;
  date: Date;
}

export interface Membership {
  userEmail: string;
  role: string;
  org: string;
  group: string;
}

export interface GroupMember {
  id: string;
  username: string;
  name: string;
  email: string;
  orgs: Org[];
  groupRole: string;
}

export interface Org {
  name: string;
  role: string;
}

export interface GroupMetadata {
  groupName: string;
  groupId: string;
  groupKey: string;
  groupStatus: string;
  groupStatusReason?: string;
}

export interface PendingMembership {
  userEmail: string;
  role: string;
  org: string;
  group: string;
  userExistsInOrg: string;
}

export interface GroupOrg {
  name: string;
  id: string;
  slug: string;
  url: string;
  group: OrgGroup;
}

export interface OrgGroup {
  name: string;
  id: string;
}

export interface v2Groups {
  groupName: string,
  admins: v2User[],
  orgs: v2Org[]
}

export interface v2User {
  fullName: string,
  email: string
}

export interface v2Org {
   orgName: string,
   collaborators: v2User[],
   admins: v2User[]
}

