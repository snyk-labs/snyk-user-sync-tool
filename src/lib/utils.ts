import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import * as fs from 'fs';
import * as path from 'path';
import { snykGroup } from './snykGroup';
import {
  GroupMember,
  PendingInvite,
  Membership,
  PendingMembership,
  GroupOrg, v2Groups
} from './types';
import * as inputUtils from './inputUtils';
import * as common from './common';
import * as utils from './utils';
import * as customErrors from './customErrors';
import { umask } from 'process';

const debug = debugLib('snyk:utils');
const { execSync } = require('child_process');

export async function checkUserExistence(
  searchEmail: string,
  groupMembers: GroupMember[],
) {
  for (const membership of groupMembers) {
    if (membership.email != null) {
      debug(`\ncomparing ${searchEmail} to ${membership.email}`);
      if (membership.email.toUpperCase() == searchEmail.toUpperCase()) {
        return true;
      }
    }
  }
  return false;
}

export async function recordPendingInvite(
  groupName: string,
  groupId: string,
  orgName: string,
  org: string,
  email: string,
) {
  let result = [];
  const pendingInvitesFile: string = 'db/pending_invites.json';
  let pendingInvites = await inputUtils.readFileToJson(pendingInvitesFile);
  debug(`pendingInvites length: ${pendingInvites.length}`);

  if (pendingInvites.length > 0) {
    result = pendingInvites;
  }
  result.push({
    groupName: groupName,
    groupId: groupId,
    orgName: orgName,
    orgId: org,
    userEmail: email,
    date: String(new Date()),
  });
  debug('writing invites to file: ');
  debug(result);
  fs.writeFileSync(pendingInvitesFile, JSON.stringify(result, null, 4));
}

export async function sendInvite(
  email: string,
  role: string,
  orgName: string,
  org: string,
  group: snykGroup,
) {
  let response = await group.inviteUserToOrg(email, role, org);
  debug('invite user response:');
  debug(response.data);

  if (response != null) {
    debug('recording pending invite:');
    debug(`${group.name}, ${group.id}, ${orgName}, ${org}, ${email}`);
    await recordPendingInvite(group.name, group.id, orgName, org, email);
    return true;
  }
  return false;
}

export async function getSnykMembershipsToAdd(
  userMemberships: Membership[],
  group: snykGroup,
  groupMembers: GroupMember[],
) {
  debug(groupMembers);
  let result: PendingMembership[] = [];

  for (const um of userMemberships) {
    let orgMatch: boolean = false;
    let roleMatch: boolean = false;

    if (um.group.toUpperCase() == group.name.toUpperCase()) {
      for (const gm of groupMembers) {
        if (gm.groupRole != 'admin' && gm.groupRole != 'viewer') {
          if (gm.email.toUpperCase() == um.userEmail.toUpperCase()) {
            for (const org of gm.orgs) {
              if (org.name == um.org) {
                orgMatch = true;
                if (org.role.toUpperCase() == um.role.toUpperCase()) {
                  roleMatch = true;
                  break;
                }
              }
            }
          }
        }
      }
      if (!roleMatch) {
        result.push({
          userEmail: `${um.userEmail}`,
          role: `${um.role}`,
          org: `${um.org}`,
          group: `${um.group}`,
          userExistsInOrg: `${orgMatch}`,
        });
      }
    }
  }
  return result;
}

export async function getSnykMembershipsToAddV2(
  sourceGroups: v2Groups[],
  group: snykGroup,
  groupMembers: GroupMember[],
) {
  debug(groupMembers);
  let result: PendingMembership[] = [];

  for (const v2Group of sourceGroups) {
    //let orgMatch: boolean = false;
    //let roleMatch: boolean = false;

    if (v2Group.groupName.toUpperCase() == group.name.toUpperCase()) {
      if (v2Group.orgs) {
        for (const v2Org of v2Group.orgs) {
          if (v2Org.collaborators) {
            for (const collaborator of v2Org.collaborators) {
              let res = do_findOrgUserRolesInSnyk(
                collaborator.email,
                'collaborator',
                v2Org.orgName,
                groupMembers
              );
              if (!res.roleMatch) {
                result.push({
                  userEmail: `${collaborator.email}`,
                  role: 'collaborator',
                  org: `${v2Org.orgName}`,
                  group: `${v2Group.groupName}`,
                  userExistsInOrg: `${res.orgMatch}`,
                });
              }
            }
          }
          if (v2Org.admins) {
            for (const admin of v2Org.admins) {
              let res = do_findOrgUserRolesInSnyk(
                admin.email,
                'admin',
                v2Org.orgName,
                groupMembers
              );
              if (!res.roleMatch) {
                result.push({
                  userEmail: `${admin.email}`,
                  role: 'admin',
                  org: `${v2Org.orgName}`,
                  group: `${v2Group.groupName}`,
                  userExistsInOrg: `${res.orgMatch}`,
                });
              }
            }
          }
        }
      }
    }
  }

     
  return result;
}

function do_findOrgUserRolesInSnyk(userEmail: string, userRole: string, userOrg: string, groupMembers: GroupMember[]) {
  let roleMatch: boolean = false;
  let orgMatch: boolean = false;
  for (const gm of groupMembers) {
    if (!roleMatch && gm.groupRole != 'admin' && gm.groupRole != 'viewer') {
      if (gm.email.toUpperCase() == userEmail.toUpperCase()) {
        for (const org of gm.orgs) {
          if (org.name == userOrg) {
            orgMatch = true;
            if (org.role.toUpperCase() == userRole.toUpperCase()) {
              roleMatch = true;
              break;
            }
          }
        }
      }
    }
  }
  return {
    roleMatch: roleMatch,
    orgMatch: orgMatch
  };
}

export async function getUserIdFromEmail(
  userEmail: string,
  groupMembers: GroupMember[],
) {
  debug(userEmail);
  debug(groupMembers);

  for (const gm of groupMembers) {
    if (gm.email != null) {
      if (gm.email.toUpperCase() == userEmail.toUpperCase()) {
        return gm.id;
      }
    }
  }
  return '';
}

export async function isPendingInvite(userEmail: string, groupId: string) {
  let pendingInvites: PendingInvite[] = await inputUtils.readFileToJson(
    common.PENDING_INVITES_FILE,
  );
  debug(pendingInvites);

  for (const pi of pendingInvites) {
    debug(
      `comparing ${pi.userEmail} to ${userEmail}, ${pi.groupId} to ${groupId}`,
    );
    if (pi.userEmail == userEmail && pi.groupId == groupId) {
      debug('Invite is pending');
      return true;
    }
  }
  return false;
}

export async function getSnykMembershipsToRemove(
  userMemberships: Membership[],
  groupMembers: GroupMember[],
) {
  let result = [];
  for (const gm of groupMembers) {
    if (gm.groupRole != 'admin') {
      for (const org of gm.orgs) {
        let roleMatch: boolean = false;
        for (const um of userMemberships) {
          if (um.userEmail.toUpperCase() == gm.email.toUpperCase()) {
            if (um.org == org.name) {
              if (um.role.toUpperCase() == org.role.toUpperCase()) {
                roleMatch = true;
                break;
              }
            }
          }
        }

        if (!roleMatch) {
          result.push({
            userEmail: `${gm.email}`,
            role: `${org.role}`,
            org: `${org.name}`,
          });
        }
      }
    }
  }
  debug(result);
  return result;
}

export async function getSnykMembershipsToRemoveV2(
  userMemberships: v2Groups[],
  groupMembers: GroupMember[],
  groupName: string
) {
  debug(`group name: ${groupName}`);
  let result = [];
  for (const gm of groupMembers) {
    let roleMatch: boolean = false;
    let groupMatch: boolean = false;
    let orgMatch: boolean = false;
    if (gm.groupRole != 'admin') {
      for (const org of gm.orgs) {
        debug(`check org ${org.name} for user ${gm.email}`)
        
        for (const v2Group of userMemberships) {
          //groupMatch = false;
          //orgMatch = false;
          if (!roleMatch && v2Group.groupName === groupName) {
            groupMatch = true;
            debug(`found matching group ${v2Group.groupName}`)
            //let orgMatch: boolean = false;
            if (v2Group.orgs) {
              for (const v2Org of v2Group.orgs) {
                debug(`checking snyk org ${org.name} against input org ${v2Org.orgName}`)
                // handle case where org name is not found in put, what should happen?
                if (org.name === v2Org.orgName) {
                  orgMatch = true;
                  debug('found matching org')
                  if (org.role === 'collaborator') {
                    if (v2Org.collaborators) {
                      for (const collaborator of v2Org.collaborators) {
                        debug(`comparing ${gm.email} to ${collaborator.email}`)
                        if (gm.email.toLowerCase() === collaborator.email.toLowerCase()) {
                          roleMatch = true;
                          break;
                        }
                      }
                    }
                  }
                  else if (org.role === 'admin') {
                    if (v2Org.admins) {
                      for (const admin of v2Org.admins) {
                        debug(`comparing ${gm.email} to ${admin.email}`)
                        if (gm.email.toLowerCase() === admin.email.toLowerCase()) {
                          roleMatch = true;
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        if (groupMatch && orgMatch) {
          if (!roleMatch) {
            result.push({
              userEmail: `${gm.email}`,
              role: `${org.role}`,
              org: `${org.name}`,
            });
          }
        }
        else {
          if (groupMatch && !orgMatch) {
            utils.log(` - Org [${org.name}] in group [${groupName}] not found in source data for [${gm.email}] ...`);
          }
          else if (!groupMatch) {
            utils.log(` - Group [${groupName}] not found in source data for [${gm.email}] ...`)
          }
        }
      }
    }
    else { //if group admin, check if exists in source memberships 
      let roleMatch: boolean = false;
      for (const um of userMemberships) {
        debug('um: ' + JSON.stringify(um));
        if (um.groupName.toLowerCase() === groupName.toLowerCase()) {
          if (um.admins) {
            for (const admin of um.admins) {
              if (admin.email.toLowerCase() === gm.email.toLowerCase()) {
                  roleMatch = true;
                  break;
              }
            }
          }
        }
      }
      if (!roleMatch) {
        utils.log(` - Group admin removal found [${gm.groupRole}:${gm.email}] for group [${groupName}] ...`)
      }
    }
  }
  debug(`result: ${result}`);
  return result;
}

export async function removeMemberships(
  userMemberships: Membership[],
  group: snykGroup,
) {
  let snykGroupMembers = await group.getMembers();
  debug('snykGroupMembers:');
  debug(snykGroupMembers);

  let membershipsToRemove = await getSnykMembershipsToRemove(
    userMemberships,
    snykGroupMembers,
  );

  utils.log(
    ` - ${membershipsToRemove.length} Snyk memberships to remove found...`,
  );
  debug(membershipsToRemove);

  let snykGroupOrgs = await group.getOrgs();

  let i = 1;
  for (const snykMembership of membershipsToRemove) {
    utils.log(
      ` - ${i} of ${membershipsToRemove.length} [${snykMembership.org} | ${snykMembership.userEmail}]`,
    );
    group.removeMembershipToOrg(
      snykMembership.org,
      await getOrgIdFromName(snykMembership.org, snykGroupOrgs),
      await getUserIdFromEmail(snykMembership.userEmail, snykGroupMembers),
    );
    i++;
  }
}

export async function removeMembershipsV2(
  userMemberships: v2Groups[],
  group: snykGroup,
) {
  let snykGroupMembers = await group.getMembers();
  debug('snykGroupMembers:');
  debug(`snykGroupMembers: ${JSON.stringify(snykGroupMembers)}`);

  let membershipsToRemove = await getSnykMembershipsToRemoveV2(
    userMemberships,
    snykGroupMembers,
    group.name
  );

  utils.log(
    ` - ${membershipsToRemove.length} Snyk memberships to remove found...`,
  );
  debug(`membershipsToRemove: ${membershipsToRemove}`);

  let snykGroupOrgs = await group.getOrgs();

  let i = 1;
  for (const snykMembership of membershipsToRemove) {
    utils.log(
      ` - ${i} of ${membershipsToRemove.length} [${snykMembership.org} | ${snykMembership.userEmail}]`,
    );
    if (!common.DRY_RUN) {
      group.removeMembershipToOrg(
        snykMembership.org,
        await getOrgIdFromName(snykMembership.org, snykGroupOrgs),
        await getUserIdFromEmail(snykMembership.userEmail, snykGroupMembers),
      );
    }
    i++;
  }
}

export async function addNewMemberships(
  userMemberships: Membership[],
  group: snykGroup,
) {
  utils.log(` - adding new memberships for ${group.name}`);
  let snykGroupMembers = await group.getMembers();
  debug('snykGroupMembers:');
  debug(snykGroupMembers);

  let membershipsToAdd = await getSnykMembershipsToAdd(
    userMemberships,
    group,
    snykGroupMembers,
  );

  utils.log(` - ${membershipsToAdd.length} new membership records found...`);
  debug(membershipsToAdd);

  let snykGroupOrgs = await group.getOrgs();

  let i = 1;
  for (const membership of membershipsToAdd) {
    process.stdout.write(
      ` - ${i}/${membershipsToAdd.length} Processing new membership `,
    );
    utils.log(
      `[${membership.org} | ${membership.userEmail} | ${membership.role}]`,
    );
    if (!common.DRY_RUN) {
      await addMembershipToSnyk(membership, snykGroupOrgs, snykGroupMembers, group)
    }
    i++;
  }
}

export async function addNewMembershipsV2(
  sourceGroups: v2Groups[],
  group: snykGroup,
) {
  utils.log(` - adding new memberships for ${group.name}`);
  let snykGroupMembers = await group.getMembers();
  debug('snykGroupMembers:');
  debug(snykGroupMembers);

  let membershipsToAdd = await getSnykMembershipsToAddV2(
    sourceGroups,
    group,
    snykGroupMembers,
  );

  utils.log(` - ${membershipsToAdd.length} new membership records found...`);
  debug(membershipsToAdd);

  let snykGroupOrgs = await group.getOrgs();

  let i = 1;
  for (const membership of membershipsToAdd) {
    process.stdout.write(
      ` - ${i}/${membershipsToAdd.length} Processing new membership `,
    );
    utils.log(
      `[${membership.org} | ${membership.userEmail} | ${membership.role}]`,
    );
    if (!common.DRY_RUN) {
      await addMembershipToSnyk(membership, snykGroupOrgs, snykGroupMembers, group)
    }
    i++;
  }
}

async function addMembershipToSnyk(
  membership: PendingMembership, 
  snykGroupOrgs: GroupOrg[], 
  snykGroupMembers: GroupMember[],
  group: snykGroup
) {
  try {
    await inputUtils.validateUserMembership(membership);

    if ((await isPendingInvite(membership.userEmail, group.id)) == false) {
      if (await checkUserExistence(membership.userEmail, snykGroupMembers)) {
        //begin user exists in group flow
        debug(snykGroupMembers);
        debug('userExistsInOrg: ' + membership.userExistsInOrg);
        if (membership.userExistsInOrg == 'true') {
          debug('Adding existing group-org member to new org');
          //change role -- update member of org
          let orgId = await getOrgIdFromName(membership.org, snykGroupOrgs);
          group.updateExistingMembershipRole(
            orgId,
            await getUserIdFromEmail(membership.userEmail, snykGroupMembers),
            membership.role,
          );
        } else {
          debug(' - Adding unassociated member');
          // add a new org member from existing userId
          let orgId = await getOrgIdFromName(membership.org, snykGroupOrgs);
          group.addGroupMemberToOrg(
            orgId,
            await getUserIdFromEmail(membership.userEmail, snykGroupMembers),
            membership.role,
          );
        }
      } else {
        //begin user does not exist in group flow here
        let orgId = await getOrgIdFromName(membership.org, snykGroupOrgs);
        console.log('orgId: ' + orgId);
        utils.log(
          ` - ${membership.userEmail} not in ${group.name}, sending invite [orgId: ${orgId}]...`,
        );
        let res = await sendInvite(
          membership.userEmail,
          membership.role,
          membership.org,
          orgId,
          group,
        );
        //console.log(res)
      }
    } else {
      utils.log(
        ` - skipping ${membership.userEmail}, invite already pending...`,
      );
    }
  } catch (err) {
    if (
      ['InvalidRole', 'InvalidEmailAddress', 'OrgIdNotFound'].indexOf(
        err.name,
      ) >= 0
    ) {
      utils.log(`Record not processed, skipping: ${err.message}`);
      //log to log file
    }
  }
}

export async function getOrgIdFromName(orgName: string, groupOrgs: GroupOrg[]) {
  //let result = '';
  for (const o of groupOrgs) {
    debug(`Comparing ${o.name} to ${orgName}...`);
    if (o.name == orgName) {
      debug(`returning ${o.id}`);
      return o.id;
    }
  }
  //return result;
  throw new customErrors.OrgIdNotFound(
    `Org ID not found for Org Name "${orgName}" - check the name is correct`,
  );
}

export function log(message: string) {
  console.log(message);
  var m = new Date();
  const LOG_TIMESTAMP =
    m.getUTCFullYear() +
    '/' +
    ('0' + (m.getUTCMonth() + 1)).slice(-2) +
    '/' +
    ('0' + m.getUTCDate()).slice(-2) +
    ' ' +
    ('0' + m.getUTCHours()).slice(-2) +
    ':' +
    ('0' + m.getUTCMinutes()).slice(-2) +
    ':' +
    ('0' + m.getUTCSeconds()).slice(-2) +
    ':' +
    ('0' + m.getUTCMilliseconds()).slice(-2) +
    ' ';
  fs.appendFileSync(
    common.LOG_FILE,
    LOG_TIMESTAMP.concat(message.replace(/^\s+|\s+$/g, '')).concat('\n'),
  );
}
