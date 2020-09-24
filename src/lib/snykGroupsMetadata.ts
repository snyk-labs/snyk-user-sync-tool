import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import { GroupMetadata } from './types';
import * as common from './common';

const debug = debugLib('snyk:snykGroupsMetadata');

export class snykGroupsMetadata {
  snykKeys: string;
  private _groupsMetadata: GroupMetadata[] = [];
  private _buffer: number = 250;

  constructor(snykKeys: string) {
    this.snykKeys = snykKeys;
  }

  async init() {
    let result: GroupMetadata = {
      groupName: '',
      groupId: '',
      groupKey: '',
      groupStatus: '',
    };
    for (const key of this.snykKeys.split(',')) {
      let keySplit = key.split(':');
      let groupName = keySplit[0];
      let groupKey = keySplit[1];
      let _requestManager = new requestsManager({
        snykToken: groupKey,
        userAgentPrefix: 'onprem-user-sync-tool',
      });
      try {
        //sleep(this._buffer)
        let response = await _requestManager.request({
          verb: 'GET',
          url: `/orgs`,
        });
        debug(response.data);
        let org = response.data.orgs[0];
        result = {
          groupName: org.group.name,
          groupId: org.group.id,
          groupKey: groupKey,
          groupStatus: 'enabled',
        };
      } catch (err) {
        if (err.name == 'RequestsManagerApiAuthenticationError') {
          debug('we are handling api auth 401');
          result = {
            groupName: groupName,
            groupId: '',
            groupKey: groupKey,
            groupStatus: 'disabled',
            groupStatusReason: 'API Authentication Error (401)',
          };
        } else if (
          err.name == 'Unknown' &&
          err.message == 'Error: Request failed with status code 403'
        ) {
          debug('we are handling 403');
          result = {
            groupName: groupName,
            groupId: '',
            groupKey: groupKey,
            groupStatus: 'disabled',
            groupStatusReason: 'API Authentication Error (403)',
          };
        } else {
          debug('we are handling generic error');
          result = {
            groupName: groupName,
            groupId: '',
            groupKey: groupKey,
            groupStatus: 'disabled',
            groupStatusReason: `${err.message}`,
          };
        }
      }
      debug(`pushing result: ${result}`);
      this._groupsMetadata.push(result);
    }
  }

  async getAllGroupsMetadata() {
    return this._groupsMetadata;
  }

  async getGroupStatusByName(groupName: string): Promise<string[]> {
    debug(`groupName: ${groupName}`);
    debug(this._groupsMetadata);
    for (const gmd of this._groupsMetadata) {
      debug(`gmd.groupName: ${gmd.groupName}`);
      if (
        gmd.groupName.toUpperCase() == groupName.toUpperCase() ||
        gmd.groupName.toUpperCase() == "'" + groupName.toUpperCase() + "'"
      ) {
        return [gmd.groupStatus, gmd.groupStatusReason || ''];
      }
    }
    return ['groupNotFound', 'Group name not Found'];
  }

  async getGroupIdByName(groupName: string): Promise<string> {
    debug(`groupName: ${groupName}`);
    debug(this._groupsMetadata);
    for (const gmd of this._groupsMetadata) {
      debug(`gmd.groupName: ${gmd.groupName}`);
      if (
        gmd.groupName.toUpperCase() == groupName.toUpperCase() ||
        gmd.groupName.toUpperCase() == "'" + groupName.toUpperCase() + "'"
      ) {
        return gmd.groupId;
      }
    }
    return '';
  }

  async getGroupKeyByName(groupName: string) {
    debug(`groupName: ${groupName}`);
    debug(`snykKeys: ${this.snykKeys}`);
    for (const key of this.snykKeys.split(',')) {
      let keySplit = key.split(':');
      debug(`key: ${key}`);
      debug(`keySplit: ${keySplit}`);
      let keyGroupName = keySplit[0];
      let keyGroupKey = keySplit[1];
      if (
        keyGroupName.toUpperCase() == groupName.toUpperCase() ||
        keyGroupName.toUpperCase() == "'" + groupName.toUpperCase() + "'"
      ) {
        return keyGroupKey;
      }
    }
  }
}
