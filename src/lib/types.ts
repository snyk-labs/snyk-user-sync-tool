export interface PendingInvite {
  orgId:string,
  email:string,
  role:string,
}

export interface PendingProvision{
  email:string,
  role:string,
  rolePublicId:string,
  created:string,
  orgid:string,
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

export interface v1Group {
  members: Membership[];
}

export interface GroupRole {
  name: string,
  description: string,
  publicId: string,
  created: string,
  modified: string
}
