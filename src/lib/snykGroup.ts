import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import * as common from './common';
import * as utils from './utils';
import * as inputUtils from './inputUtils';
import * as customErrors from './customErrors';
import {
  GroupMember,
  GroupOrg,
  Membership,
  v2Group,
  v1Group,
  PendingMembership,
} from './types';

const debug = debugLib('snyk:snykGroup');

export class snykGroup {
  id: string;
  name: string;
  key: string;
  sourceMemberships: v2Group | v1Group;
  private _members: GroupMember[] = [];
  private _buffer: number = 250;
  private _requestManager: requestsManager;

  constructor(
    id: string,
    name: string,
    key: string,
    sourceMemberships: v2Group | v1Group,
  ) {
    this.id = id;
    this.name = name;
    this.key = key;
    this.sourceMemberships = sourceMemberships;
    this._requestManager = new requestsManager({
      snykToken: this.key,
      userAgentPrefix: 'snyk-user-sync-tool',
    });
  }

  async init() {
    // initialize group object with members
    let members: GroupMember[] = [];
    try {
      let response = await this._requestManager.request({
        verb: 'GET',
        url: `/group/${this.id}/members`,
      });
      debug(response.data);
      this._members = response.data;
    } catch (err) {
      utils.log(err);
    }
  }
  async getMembers() {
    return this._members;
  }
  userExists(searchEmail: string) {
    for (const membership of this._members) {
      if (membership.email != null) {
        debug(`\ncomparing ${searchEmail} to ${membership.email}`);
        if (membership.email.toUpperCase() == searchEmail.toUpperCase()) {
          return true;
        }
      }
    }
    return false;
  }
  private async getOrgs(): Promise<GroupOrg[]> {
    let result: GroupOrg[] = [];
    try {
      let response = await this._requestManager.request({
        verb: 'GET',
        url: `/orgs`,
      });
      result = response.data.orgs;
    } catch (err) {
      utils.log(err);
    }
    return result;
  }
  async inviteUserToOrg(email: string, role: string, org: string) {
    let inviteBody = `{
            "email": "${email}"
        }`;
    if (
      role.toUpperCase() == 'ADMIN' ||
      role.toUpperCase() == 'ADMINISTRATOR'
    ) {
      inviteBody = `{
                "email": "${email}",
                "isAdmin": true
            }
            `;
    }

    try {
      return await this._requestManager.request({
        verb: 'POST',
        url: `/org/${org}/invite`,
        body: inviteBody,
      });
    } catch (err) {
      utils.log(err);
    }
  }
  async sendInvite(email: string, role: string, orgName: string, org: string) {
    let response = await this.inviteUserToOrg(email, role, org);
    debug('invite user response:');
    debug(response.data);

    if (response != null) {
      debug('recording pending invite:');
      debug(`${this.name}, ${this.id}, ${orgName}, ${org}, ${email}`);
      await utils.recordPendingInvite(this.name, this.id, orgName, org, email);
      return true;
    }
    return false;
  }
  private async updateExistingMembershipRole(
    orgId: string,
    userId: string,
    role: string,
  ) {
    let updateBody = `{
            "role": "${role}"
        }
        `;
    debug(`updateBody: ${updateBody}`);
    try {
      return await this._requestManager.request({
        verb: 'PUT',
        url: `/org/${orgId}/members/${userId}`,
        body: updateBody,
      });
    } catch (err) {
      utils.log(err);
    }
  }
  private async do_addOrgMembership(snykMembership: {
    userEmail: string;
    role: string;
    org: string;
  }) {
    //get orgId and userId for addition
    const orgId = await this.getOrgIdFromName(snykMembership.org);
    const userId = await this.getUserIdFromEmail(snykMembership.userEmail);
    let updateBody = `{
            "userId": "${userId}",
            "role": "${snykMembership.role}"
        }
        `;
    try {
      //sleep(this._buffer)
      return await this._requestManager.request({
        verb: 'POST',
        url: `/group/${this.id}/org/${orgId}/members`,
        body: updateBody,
      });
    } catch (err) {
      utils.log(err);
    }
  }
  private async removeOrgMembership(snykMembership: {
    userEmail: string;
    role: string;
    org: string;
  }) {
    try {
      //get orgId and userId for removal
      const orgId = await this.getOrgIdFromName(snykMembership.org);
      const userId = await this.getUserIdFromEmail(snykMembership.userEmail);
      return await this._requestManager.request({
        verb: 'DELETE',
        url: `/org/${orgId}/members/${userId}`,
      });
    } catch (err) {
      utils.log(err);
    }
  }
  private async addOrgMembership(snykMembership: PendingMembership) {
    try {
      await inputUtils.validateUserMembership(snykMembership);

      if (
        (await utils.isPendingInvite(snykMembership.userEmail, this.id)) ==
        false
      ) {
        if (this.userExists(snykMembership.userEmail)) {
          //begin user exists in group flow
          debug('userExistsInOrg: ' + snykMembership.userExistsInOrg);
          if (snykMembership.userExistsInOrg == 'true') {
            debug('Adding existing group-org member to new org');
            //change role -- update member of org
            let orgId = await this.getOrgIdFromName(snykMembership.org);
            this.updateExistingMembershipRole(
              orgId,
              await this.getUserIdFromEmail(snykMembership.userEmail),
              snykMembership.role,
            );
          } else {
            debug(' - Adding unassociated member');
            // add a new org member from existing userId
            let orgId = await this.getOrgIdFromName(snykMembership.org);
            this.do_addOrgMembership(snykMembership);
          }
        } else {
          //begin user does not exist in group flow here
          let orgId = await this.getOrgIdFromName(snykMembership.org);
          console.log('orgId: ' + orgId);
          utils.log(
            ` - ${snykMembership.userEmail} not in ${this.name}, sending invite [orgId: ${orgId}]...`,
          );
          let res = await this.sendInvite(
            snykMembership.userEmail,
            snykMembership.role,
            snykMembership.org,
            orgId,
          );
          //console.log(res)
        }
      } else {
        utils.log(
          ` - skipping ${snykMembership.userEmail}, invite already pending...`,
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
  async getOrgIdFromName(orgName: string) {
    //let result = '';
    const groupOrgs = await this.getOrgs();
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
  async getUserIdFromEmail(userEmail: string) {
    for (const gm of this._members) {
      if (gm.email != null) {
        if (gm.email.toUpperCase() == userEmail.toUpperCase()) {
          return gm.id;
        }
      }
    }
    return '';
  }
  async addNewMemberships() {
    var membershipsToAdd = await this.getSnykMembershipsToAdd();
    utils.log(` - ${membershipsToAdd.length} Snyk memberships to add found...`);
    debug(membershipsToAdd);

    let i = 1;
    for (const snykMembership of membershipsToAdd) {
      utils.log(
        `[${snykMembership.org} | ${snykMembership.userEmail} | ${snykMembership.role}]`,
      );
      if (!common.DRY_RUN_FLAG) {
        await this.addOrgMembership(snykMembership);
      }
      i++;
    }
  }
  async removeStaleMemberships() {
    var membershipsToRemove = await this.getSnykMembershipsToRemove();

    utils.log(
      ` - ${membershipsToRemove.length} Snyk memberships to remove found...`,
    );
    debug(membershipsToRemove);

    let i = 1;
    for (const snykMembership of membershipsToRemove) {
      utils.log(
        ` - ${i} of ${membershipsToRemove.length} [${snykMembership.org} | ${snykMembership.userEmail}]`,
      );
      if (!common.DRY_RUN_FLAG) {
        await this.removeOrgMembership(snykMembership);
      }
      i++;
    }
  }
  private sourceIsV1() {
    return (this.sourceMemberships as v1Group).members !== undefined;
  }
  private async getSnykMembershipsToAdd() {
    var result = [];

    if (this.sourceIsV1()) {
      result = await this.do_getSnykMembershipsToAddV1();
    } else {
      result = await this.do_getSnykMembershipsToAddV2();
    }

    return result;
  }
  private async do_getSnykMembershipsToAddV1() {
    var result: PendingMembership[] = [];

    for (const um of (this.sourceMemberships as v1Group).members) {
      var orgMatch: boolean = false;
      var roleMatch: boolean = false;

      for (const gm of this._members) {
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
    return result;
  }
  private async do_getSnykMembershipsToAddV2() {
    var result: PendingMembership[] = [];
    var sourceMemberships = this.sourceMemberships as v2Group;

    if (sourceMemberships.orgs) {
      for (const v2Org of sourceMemberships.orgs) {
        if (v2Org.collaborators) {
          for (const collaborator of v2Org.collaborators) {
            var res = this.do_findOrgUserRolesInSnyk(
              collaborator.email,
              'collaborator',
              v2Org.orgName,
            );
            if (!res.roleMatch) {
              result.push({
                userEmail: `${collaborator.email}`,
                role: 'collaborator',
                org: `${v2Org.orgName}`,
                group: `${this.name}`,
                userExistsInOrg: `${res.orgMatch}`,
              });
            }
          }
        }
        if (v2Org.admins) {
          for (const admin of v2Org.admins) {
            var res = this.do_findOrgUserRolesInSnyk(
              admin.email,
              'admin',
              v2Org.orgName,
            );
            if (!res.roleMatch) {
              result.push({
                userEmail: `${admin.email}`,
                role: 'admin',
                org: `${v2Org.orgName}`,
                group: `${this.name}`,
                userExistsInOrg: `${res.orgMatch}`,
              });
            }
          }
        }
      }
    }
    return result;
  }
  private async getSnykMembershipsToRemove() {
    let result = [];

    if (this.sourceIsV1()) {
      result = await this.do_getSnykMembershipsToRemoveV1();
    } else {
      result = await this.do_getSnykMembershipsToRemoveV2();
    }

    return result;
  }
  private async do_getSnykMembershipsToRemoveV1() {
    let result = [];
    for (const gm of this._members) {
      if (gm.groupRole != 'admin') {
        for (const org of gm.orgs) {
          let roleMatch: boolean = false;
          for (const um of (this.sourceMemberships as v1Group).members) {
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
    debug(`result: ${result}`);
    return result;
  }
  private async do_getSnykMembershipsToRemoveV2() {
    let result = [];
    let sourceMemberships = this.sourceMemberships as v2Group;
    for (const gm of this._members) {
      let roleMatch: boolean = false;
      let orgMatch: boolean = false;
      if (gm.groupRole != 'admin') {
        for (const org of gm.orgs) {
          debug(`check org ${org.name} for user ${gm.email}`);

          if (!roleMatch) {
            if (sourceMemberships.orgs) {
              for (const v2Org of sourceMemberships.orgs) {
                debug(
                  `checking snyk org ${org.name} against input org ${v2Org.orgName}`,
                );
                // handle case where org name is not found in put, what should happen?
                if (org.name === v2Org.orgName) {
                  orgMatch = true;
                  debug('found matching org');
                  if (org.role === 'collaborator') {
                    if (v2Org.collaborators) {
                      for (const collaborator of v2Org.collaborators) {
                        debug(`comparing ${gm.email} to ${collaborator.email}`);
                        if (
                          gm.email.toLowerCase() ===
                          collaborator.email.toLowerCase()
                        ) {
                          roleMatch = true;
                          break;
                        }
                      }
                    }
                  } else if (org.role === 'admin') {
                    if (v2Org.admins) {
                      for (const admin of v2Org.admins) {
                        debug(`comparing ${gm.email} to ${admin.email}`);
                        if (
                          gm.email.toLowerCase() === admin.email.toLowerCase()
                        ) {
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

          if (orgMatch) {
            if (!roleMatch) {
              result.push({
                userEmail: `${gm.email}`,
                role: `${org.role}`,
                org: `${org.name}`,
              });
            }
          } else {
            if (!orgMatch) {
              utils.log(
                ` - Org [${org.name}] in group [${this.name}] not found in source data for [${gm.email}] ...`,
              );
            }
            //else if (!groupMatch) {
            //  utils.log(` - Group [${groupName}] not found in source data for [${gm.email}] ...`)
            //}
          }
        }
      } else {
        //if group admin, check if exists in source memberships
        let roleMatch: boolean = false;
        if (sourceMemberships.admins) {
          for (const admin of sourceMemberships.admins) {
            if (admin.email.toLowerCase() === gm.email.toLowerCase()) {
              roleMatch = true;
              break;
            }
          }
        }
        if (!roleMatch) {
          utils.log(
            ` - Group admin removal found [${gm.groupRole}:${gm.email}] for group [${this.name}] ...`,
          );
        }
      }
    }
    debug(`result: ${result}`);
    return result;
  }
  private do_findOrgUserRolesInSnyk(
    userEmail: string,
    userRole: string,
    userOrg: string,
  ) {
    let roleMatch: boolean = false;
    let orgMatch: boolean = false;
    for (const gm of this._members) {
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
      orgMatch: orgMatch,
    };
  }
}
