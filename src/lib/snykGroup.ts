import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import * as pMap from 'p-map';
import * as common from './common';
import * as utils from './utils';
import * as inputUtils from './inputUtils';
import * as customErrors from './customErrors';
import {
  GroupMember,
  GroupOrg,
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
  private _orgs: GroupOrg[] = [];
  private _snykMembershipQueue: any[];
  private _snykMembershipRemovalQueue: any[];
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
    this._snykMembershipQueue = [];
    this._snykMembershipRemovalQueue = [];

    this._requestManager = new requestsManager({
      snykToken: this.key,
      userAgentPrefix: 'snyk-user-sync-tool',
    });
  }

  async init() {
    // initialize group object with members
    try {
      let response = await this._requestManager.request({
        verb: 'GET',
        url: `/group/${this.id}/members`,
      });
      debug(JSON.stringify(response.data, null, 2));
      this._members = response.data;
      this._members = this._members.filter((x) => x.email != null);
    } catch (err) {
      utils.log(err);
    }

    try {
      let response = await this._requestManager.request({
        verb: 'GET',
        url: `/orgs`,
      });
      this._orgs = response.data.orgs;
    } catch (err) {
      utils.log(err);
    }
  }
  async getMembers() {
    return this._members;
  }
  async getOrgs() {
    return this._orgs;
  }
  async userExists(searchEmail: string) {
    debug(`\nchecking if ${searchEmail} exists in group`);
    if (
      this._members.some(
        (e) => e.email.toUpperCase() == searchEmail.toUpperCase(),
      )
    ) {
      debug(`${searchEmail} found in group`);
      return true;
    } else {
      debug(`${searchEmail} NOT found in group`);
      return false;
    }
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
  private async queueSnykMembership(snykMembership: PendingMembership) {
    this._snykMembershipQueue.push(snykMembership);
  }
  private async queueSnykMembershipRemoval(snykMembershipRemoval: {
    userEmail: string;
    role: string;
    org: string;
  }) {
    this._snykMembershipRemovalQueue.push(snykMembershipRemoval);
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
  private async processQueue(queue: any[]) {
    const results = [];
    var numProcessed: number = 0;
    utils.log(`Processing ${queue.length} requests to API`);
    utils.log(' - Waiting for updates to complete...');

    await pMap(
      queue,
      async (reqData) => {
        try {
          utils.printProgress(` - ${++numProcessed}/${queue.length} completed`);
          const res = await this._requestManager.request(reqData);
          results.push(res);
        } catch (e) {
          utils.log(`${e}`);
          debug(e);
        }
      },
      { concurrency: 10 },
    );
    //utils.log(` - ${results.length} updates successfully processed`);
  }
  private async addSnykMembershipsFromQueue() {
    let userMembershipQueue = [];

    for (const sm of this._snykMembershipQueue) {
      try {
        await inputUtils.validateUserMembership(sm);
        if ((await utils.isPendingInvite(sm.userEmail, this.id)) == false) {
          if ((await this.userExists(sm.userEmail)) == true) {
            //begin user exists in group flow
            const orgId = await this.getOrgIdFromName(sm.org);
            const userId = await this.getUserIdFromEmail(sm.userEmail);
            debug('userExistsInOrg: ' + sm.userExistsInOrg);
            if (sm.userExistsInOrg == 'true') {
              //user already in org, so just update existing record
              debug('Updating existing group-org member role');
              //change role -- update member of org
              let updateBody = `{
                "role": "${sm.role}"
              }`;

              debug(`updateBody: ${updateBody}`);

              userMembershipQueue.push({
                verb: 'PUT',
                url: `/org/${orgId}/members/${userId}`,
                body: updateBody,
              });
            } else {
              // user not in org, add them
              let updateBody = `{
                "userId": "${userId}",
                "role": "${sm.role}"
              }`;

              userMembershipQueue.push({
                verb: 'POST',
                url: `/group/${this.id}/org/${orgId}/members`,
                body: updateBody,
              });
            }
          } else {
            //user not in group, send invite
            let orgId = await this.getOrgIdFromName(sm.org);
            utils.log(
              ` - ${sm.userEmail} not in ${this.name}, sending invite [orgId: ${orgId}]...`,
            );

            let inviteBody = `{
              "email": "${sm.userEmail}"
            }`;
            if (
              sm.role.toUpperCase() == 'ADMIN' ||
              sm.role.toUpperCase() == 'ADMINISTRATOR'
            ) {
              inviteBody = `{
                        "email": "${sm.userEmail}",
                        "isAdmin": true
                    }
                    `;
            }
            userMembershipQueue.push({
              verb: 'POST',
              url: `/org/${orgId}/invite`,
              body: inviteBody,
            });
            debug('recording pending invite:');
            debug(
              `${this.name}, ${this.id}, ${sm.org}, ${orgId}, ${sm.userEmail}`,
            );
            await utils.recordPendingInvite(
              this.name,
              this.id,
              sm.org,
              orgId,
              sm.userEmail,
            );
          }
        } else {
          utils.log(` - skipping ${sm.userEmail}, invite already pending...`);
        }
      } catch (err) {
        console.log(err);
      }
    }
    debug(userMembershipQueue);
    this.processQueue(userMembershipQueue);
  }
  private async removeSnykMembershipsFromQueue() {
    let membershipRemovalQueue = [];

    for (const mr of this._snykMembershipRemovalQueue) {
      //get orgId and userId for removal
      const orgId = await this.getOrgIdFromName(mr.org);
      const userId = await this.getUserIdFromEmail(mr.userEmail);
      membershipRemovalQueue.push({
        verb: 'DELETE',
        url: `/org/${orgId}/members/${userId}`,
      });
    }

    debug(membershipRemovalQueue);

    this.processQueue(membershipRemovalQueue);
  }
  async addNewMemberships() {
    console.log();
    utils.log(`Checking for memberships to add...`);
    var membershipsToAdd = await this.getSnykMembershipsToAdd();
    utils.log(` - ${membershipsToAdd.length} Snyk memberships to add found...`);
    debug(membershipsToAdd);

    let i = 1;
    for (const snykMembership of membershipsToAdd) {
      utils.log(
        `   [${snykMembership.org} | ${snykMembership.userEmail} | ${snykMembership.role}]`,
      );
      if (!common.DRY_RUN_FLAG) {
        await this.queueSnykMembership(snykMembership);
      }
      i++;
    }
    await this.addSnykMembershipsFromQueue();
  }
  async removeStaleMemberships() {
    console.log();
    utils.log(`Checking for memberships to remove...`);
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
        await this.queueSnykMembershipRemoval(snykMembership);
      }
      i++;
    }
    this.removeSnykMembershipsFromQueue();
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
                      debug(
                        `looking for ${gm.email} in ${v2Org.collaborators}`,
                      );
                      for (const collaborator of v2Org.collaborators) {
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
                      debug(`looking for ${gm.email} in ${v2Org.admins}`);
                      for (const admin of v2Org.admins) {
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
