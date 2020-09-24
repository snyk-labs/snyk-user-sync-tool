import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import * as common from './common';
import * as utils from './utils';
import { GroupMember, GroupOrg } from './types';

const debug = debugLib('snyk:snykGroup');

export class snykGroup {
  id: string;
  name: string;
  key: string;
  private _members: GroupMember[] = [];
  private _buffer: number = 250;
  private _requestManager: requestsManager;

  constructor(id: string, name: string, key: string) {
    this.id = id;
    this.name = name;
    this.key = key;
    this._requestManager = new requestsManager({
      snykToken: this.key,
      userAgentPrefix: 'onprem-user-sync-tool',
    });
  }

  async init() {
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

  async getOrgs(): Promise<GroupOrg[]> {
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

  async updateExistingMembershipRole(
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

  async addGroupMemberToOrg(orgId: string, userId: string, role: string) {
    let updateBody = `{
            "userId": "${userId}",
            "role": "${role}"
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

  async removeMembershipToOrg(orgName: string, orgId: string, userId: string) {
    try {
      return await this._requestManager.request({
        verb: 'DELETE',
        url: `/org/${orgId}/members/${userId}`,
      });
    } catch (err) {
      utils.log(err);
    }
  }
}
