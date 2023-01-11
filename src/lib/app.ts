import {
  PREV_DIR,
  PENDING_INVITES_FILE,
  ADD_NEW_FLAG,
  DRY_RUN_FLAG,
  MEMBERSHIP_FILE,
  API_KEYS,
  DELETE_MISSING_FLAG,
} from './common';
import {
  readFileToJson,
  getUniqueGroups,
  getUniqueOrgs
} from './inputUtils';
import { snykGroup } from './snykGroup';
import { snykGroupsMetadata } from './snykGroupsMetadata';
import * as debugLib from 'debug';
import * as utils from './utils';
import { Membership, v1Group } from './types';
import * as ora from 'ora';

const debug = debugLib('snyk:app');
const spinner = ora();
spinner.color = 'white';

export async function processMemberships() {
  var sourceGroups;
  var sourceMemberships: Membership[] = [];
  var groupsMetadata = new snykGroupsMetadata(API_KEYS);

  await groupsMetadata.init();
  debug(`groupsMetadata: ${JSON.stringify(groupsMetadata, null, 2)}`);

    debug('processing v1 format');
    var sourceMemberships: Membership[] = [];
    try {
      sourceMemberships = await readFileToJson(MEMBERSHIP_FILE);
      debug(`sourceMemberships: ${JSON.stringify(sourceMemberships, null, 2)}`);
      utils.log(
        `\nMembership records in input file: ${sourceMemberships.length}`,
      );

      var uniqueOrgs = await getUniqueOrgs(sourceMemberships);
      sourceGroups = await getUniqueGroups(sourceMemberships);
    } catch (err: any) {
      utils.log(`unable to process source data, check format`);
      process.exit(1);
    }

  // process each unique group sequentially
  for (const gmd of await groupsMetadata.getAllGroupsMetadata()) {
    debug(`groupMetadata: ${JSON.stringify(gmd)}`);
    var groupStatus: string[] = await groupsMetadata.getGroupStatusByName(
      gmd.groupName,
    );
    debug(`groupStatus: ${groupStatus}`);

    if (groupStatus[0] == 'enabled') {
      var groupId = await groupsMetadata.getGroupIdByName(gmd.groupName);
      var groupKey = await groupsMetadata.getGroupKeyByName(gmd.groupName);
      var group;

      try {
          const sourceMembershipsForGroup = {
            members: sourceMemberships.filter(function(el) {
              return el.group === gmd.groupName;
            }),
          };
          if (sourceMembershipsForGroup !== undefined) {
            group = new snykGroup(
              String(groupId),
              gmd.groupName,
              String(groupKey),
              sourceMembershipsForGroup as v1Group,
            );
          } else {
            utils.log(`${gmd.groupName} not found in source, skipping...`);
            continue;
          }

        utils.log(`\nAnalyzing ${gmd.groupName} [${groupId}]`);
        spinner.start();
        await group.init();
        spinner.stop();
        debug(`group: ${group}`);

        if (ADD_NEW_FLAG) {
          // process any new memberships in the input file
          console.log()
          await group.addNewMemberships();
        }

        if (DELETE_MISSING_FLAG) {
          // remove any memberships from snyk that are missing in the input file
          await group.removeStaleMemberships();
        }
      } catch (err: any) {
        throw err;
        if (err.name == 'TypeError') {
          utils.log(`unable to process source data, check format`);
          process.exit(1);
        } else {
          utils.log(`generic error encountered: ${err.message}`);
        }
      }
    } else {
      utils.log(
        `group ${gmd.groupName} cannot be processed, skipping: ${groupStatus[1]}`,
      );
      //todo: log to file
    }
  }
}
