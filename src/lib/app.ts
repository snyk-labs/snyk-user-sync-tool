import {
  PREV_DIR,
  PENDING_INVITES_FILE,
  ADD_NEW_FLAG,
  DRY_RUN_FLAG,
  V2_FORMAT_FLAG,
  MEMBERSHIP_FILE,
  API_KEYS,
  DELETE_MISSING_FLAG,
} from './common';
import {
  readFileToJson,
  getUniqueGroups,
  getUniqueOrgs,
  removeAcceptedPendingInvites,
} from './inputUtils';
import { snykGroup } from './snykGroup';
import { snykGroupsMetadata } from './snykGroupsMetadata';
import * as debugLib from 'debug';
import * as utils from './utils';
import { Membership, v2Group, PendingInvite, v1Group } from './types';
import * as ora from 'ora'

const debug = debugLib('snyk:app');
const spinner = ora();

export async function processMemberships() {
  var sourceGroups;
  var sourceMemberships: Membership[] = [];
  var groupsMetadata = new snykGroupsMetadata(API_KEYS);

  await groupsMetadata.init();
  debug(`groupsMetadata: ${groupsMetadata}`);

  var pendingInvites: PendingInvite[] = await readFileToJson(
    PENDING_INVITES_FILE,
  );
  debug(`pendingInvites: ${pendingInvites}`);
  console.log(`Pending invites found: ${pendingInvites.length}`);

  if (V2_FORMAT_FLAG) {
    //process v2 format
    debug('processing v2 format');
    sourceGroups = [];
    try {
      sourceGroups = (await readFileToJson(MEMBERSHIP_FILE)).groups;
      debug(`sourceGroups: ${sourceGroups}`);
      utils.log(`\nGroups in input file: ${sourceGroups.length}\n`);
    } catch (err) {
      utils.log(`error processing source data: ${err.message}`);
      process.exit(1);
    }
  } else {
    debug('processing v1 format');
    var sourceMemberships: Membership[] = [];
    try {
      sourceMemberships = await readFileToJson(MEMBERSHIP_FILE);
      debug(`sourceMemberships: ${sourceMemberships}`);
      utils.log(
        `\nMembership records in input file: ${sourceMemberships.length}\n`,
      );

      var uniqueOrgs = await getUniqueOrgs(sourceMemberships);
      sourceGroups = await getUniqueGroups(sourceMemberships);
    } catch (err) {
      utils.log(`unable to process source data, check format`);
      process.exit(1);
    }
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
        if (V2_FORMAT_FLAG) {
          const [sourceGroup] = (sourceGroups as v2Group[]).filter(function(
            el,
          ) {
            return el.groupName === gmd.groupName;
          });

          if (sourceGroup !== undefined) {
            group = new snykGroup(
              String(groupId),
              gmd.groupName,
              String(groupKey),
              sourceGroup as v2Group,
            );
          } else {
            utils.log(`${gmd.groupName} not found in source, skipping...`);
            continue;
          }
        } else {
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
        }

        utils.log(`Analyzing ${gmd.groupName} [${groupId}]`);
        spinner.start()
        await group.init();
        spinner.stop()
        debug(`group: ${group}`);

        //remove any 'pending invites' that have since been accepted
        await removeAcceptedPendingInvites(groupId, await group.getMembers());

        if (ADD_NEW_FLAG) {
          // process any new memberships in the input file
          await group.addNewMemberships();
        }

        if (DELETE_MISSING_FLAG) {
          // remove any memberships from snyk that are missing in the input file
          await group.removeStaleMemberships();
        }
      } catch (err) {
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
