#!/usr/bin/env node
import * as yargs from 'yargs';
import * as fs from 'fs';
import * as path from 'path';
import * as debugLib from 'debug';
import { snykGroup } from './snykGroup';
import { snykGroupsMetadata } from './snykGroupsMetadata';
import * as utils from './utils';
import * as inputUtils from './inputUtils';
import { PREV_DIR, PENDING_INVITES_FILE } from './common';
import { Membership, PendingInvite } from './types';

const debug = debugLib('snyk:main');

export default function(): boolean {
  return true;
}

const argv = yargs
  .usage(
    `\nUsage: $0 [OPTIONS]
                If no arguments are specified, values will be picked up from environment variables`,
  )
  .options({
    'delete-missing': {
      describe: `delete memberships from Snyk if they are found 
                       to be missing from the membership-file (use with caution)`,
      demandOption: false,
    },
    'membership-file': {
      describe: `path to membership file
                       if not specified, taken from SNYK_IAM_MEMBERSHIP_FILE`,
      demandOption: false,
    },
    'api-keys': {
      describe: `list of api keys per group
                       if not specified, taken from SNYK_IAM_API_KEYS`,
      demandOption: false,
    },
    'api-uri': {
      describe: `for on-premise/self-hosted, API base URI like https://my.snyk.domain/api
                       if not specified, taken from SNYK_API.  Snyk SaaS endpoint 
                       is used if neither are specified`,
      demandOption: false,
    },
    debug: {
      describe: `enable debug mode`,
      demandOption: false,
      type: 'boolean',
    },
  })
  .help().argv;

const snykKeys: string = String(
  argv['api-keys'] ? argv['api-keys'] : process.env.SNYK_IAM_API_KEYS,
);
const snykMembershipFile: string = String(
  argv['membership-file']
    ? argv['membership-file']
    : process.env.SNYK_IAM_MEMBERSHIP_FILE,
);
const snykApiBaseUri: string = String(
  argv['api-uri'] ? argv['api-uri'] : process.env.SNYK_API,
);
const deleteMissingFlag: boolean = Boolean(
  argv['delete-missing'] ? argv['delete-missing'] : false,
);

const checkEnvironment = () => {
  //console.log(`DEBUG mode is ${debug}`)
  if (snykApiBaseUri == 'undefined') {
    utils.log('snykApiBaseUri: not specified, default to SaaS');
  } else {
    utils.log(`snykApiBaseUri: ${snykApiBaseUri}`);
  }
  utils.log(`Delete Missing enabled?: ${deleteMissingFlag}`);
  debug('SNYK_IAM_API_KEYS: ');
  for (const key of snykKeys.split(',')) {
    debug(` ${key}`);
  }

  debug('SNYK_IAM_MEMBERSHIP_FILE: ' + snykMembershipFile);
  debug('SNYK_API: ' + snykApiBaseUri);
  debug('--delete-missing flag: ' + deleteMissingFlag);

  if (snykKeys == 'undefined' || snykMembershipFile == 'undefined') {
    utils.log('environment not set\n');
    utils.log('snykKeys:');
    inputUtils.printKeys(snykKeys);
    utils.log(`snykMembershipFile: ${snykMembershipFile}`);
    utils.log(`deleteMissingFlag: ${deleteMissingFlag}`);
    yargs.showHelp();
    process.exit(1);
  }
};

const run = async () => {
  await inputUtils.initializeDb();
  checkEnvironment();

  utils.log(`\nPending invites file: ${PENDING_INVITES_FILE}`);

  let sourceMemberships: Membership[] = [];

  try {
    sourceMemberships = await inputUtils.readFileToJson(snykMembershipFile);
    utils.log(
      `\nMembership records in input file: ${sourceMemberships.length}\n`,
    );
    debug(sourceMemberships);

    sourceMemberships = await inputUtils.sortUserMemberships(sourceMemberships);
  } catch (err) {
    process.exit(1);
  }

  let groupsMetadata = new snykGroupsMetadata(snykKeys);
  await groupsMetadata.init();

  debug(groupsMetadata);

  let pendingInvites: PendingInvite[] = await inputUtils.readFileToJson(
    PENDING_INVITES_FILE,
  );
  debug(pendingInvites);

  // foreach unique group+org get the memberships
  let uniqueOrgs = await inputUtils.getUniqueOrgs(sourceMemberships);
  let uniqueGroups = await inputUtils.getUniqueGroups(sourceMemberships);

  console.log(`Pending invites found: ${pendingInvites.length}`);

  // process each unique group sequentially
  for (const g of uniqueGroups) {
    let groupStatus: string[] = await groupsMetadata.getGroupStatusByName(
      g.name,
    );
    debug(`groupStatus: ${groupStatus}`);

    if (groupStatus[0] == 'enabled') {
      let groupId = await groupsMetadata.getGroupIdByName(g.name);
      let groupKey = await groupsMetadata.getGroupKeyByName(g.name);

      let group = new snykGroup(String(groupId), g.name, String(groupKey));
      await group.init();
      utils.log(`\nProcessing ${g.name} [${groupId}]`);

      // remove any 'pending invites' that have since been accepted
      await inputUtils.removeAcceptedPendingInvites(
        groupId,
        await group.getMembers(),
      );

      // process any new memberships in the input file
      await utils.addNewMemberships(sourceMemberships, group);
    } else {
      utils.log(
        `group ${g.name} cannot be processed, skipping: ${groupStatus[1]}`,
      );
      //todo: log to file
    }
  }
  // if flag set, process any memberships that have been
  // removed from the input file for each group within snyk
  if (deleteMissingFlag == true) {
    for (const gmd of await groupsMetadata.getAllGroupsMetadata()) {
      let groupStatus: string[] = await groupsMetadata.getGroupStatusByName(
        gmd.groupName,
      );
      debug(`groupStatus: ${groupStatus}`);

      if (groupStatus[0] == 'enabled') {
        utils.log(`\nProcessing stale memberships for ${gmd.groupName}`);
        let group = new snykGroup(gmd.groupId, gmd.groupName, gmd.groupKey);
        await group.init();
        await utils.removeMemberships(sourceMemberships, group);
      } else {
        utils.log(
          `group ${gmd.groupName} cannot be processed, skipping: ${groupStatus[1]}`,
        );
      }
    }
  }
  await inputUtils.backupUserMemberships(snykMembershipFile);
};

run();
