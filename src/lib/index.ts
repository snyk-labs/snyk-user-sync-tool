#!/usr/bin/env node
import * as yargs from 'yargs';
import * as fs from 'fs';
import * as path from 'path';
import * as debugLib from 'debug';
import { snykGroup } from './snykGroup';
import { snykGroupsMetadata } from './snykGroupsMetadata';
import * as utils from './utils';
import * as inputUtils from './inputUtils';
import { PREV_DIR, PENDING_INVITES_FILE, DRY_RUN, setDryRun } from './common';
import { Membership, v2Groups, PendingInvite } from './types';
import { exit } from 'process';

const debug = debugLib('snyk:main');

export default function(): boolean {
  return true;
}

const argv = yargs
  .usage(
    `\nUsage: $0 [OPTIONS]
                If no arguments are specified, values will be picked up from environment variables.\n
                If pointing to a self-hosted or on-premise instance of Snyk,
                SNYK_API is required to be set in your environment,
                e.g. SNYK_API=https://my.snyk.domain/api. If omitted, then Snyk SaaS is used.`,
  )
  .options({
    'add-new': {
      describe: `add memberships if they are found in the 
                       membership-file and are not in Snyk`,
      demandOption: false,
    },
    'delete-missing': {
      describe: `delete memberships from Snyk if they are found 
                       to be missing from the membership-file (use with caution)`,
      demandOption: false,
    },
    'v2': {
      describe: `use v2 file format`,
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
    'silent': {
      describe: `suppress interactive confirmation prompts and assume Yes`,
      demandOption: false,
    },
    'dry-run': {
      describe: `print/log the execution plan without making any updates to Snyk`,
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
const snykApiBaseUri: string = String(process.env.SNYK_API);
const addNewFlag: boolean = Boolean(
  argv['add-new'] ? argv['add-new'] : false,
);
const deleteMissingFlag: boolean = Boolean(
  argv['delete-missing'] ? argv['delete-missing'] : false,
);
const dryRun = Boolean(
  argv['dry-run'] ? argv['dry-run'] : false,
)
setDryRun(dryRun);
const v2FormatFlag: boolean = Boolean(
  argv['v2'] ? argv['v2'] : false,
);

const checkEnvironment = () => {
  //console.log(`DEBUG mode is ${debug}`)
  utils.log(`dry run: ${DRY_RUN}`)
  if (snykApiBaseUri == 'undefined') {
    utils.log('snykApiBaseUri: not specified, default to SaaS');
  } else {
    utils.log(`snykApiBaseUri: ${snykApiBaseUri}`);
  }
  utils.log(`v2 format enabled?: ${v2FormatFlag}`);
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
    utils.log(`addNewFlag: ${addNewFlag}`);
    utils.log(`deleteMissingFlag: ${deleteMissingFlag}`);
    yargs.showHelp();
    process.exit(1);
  }
};

async function processMembershipsV2() {
  debug('processing v2 format')
  let sourceGroups: v2Groups[] = [];
  
    try {
      sourceGroups = (await inputUtils.readFileToJson(snykMembershipFile)).groups;
      debug(`sourceGroups: ${sourceGroups}`);
      utils.log(
        `\nGroups in input file: ${sourceGroups.length}\n`,
      );
    } catch (err) {
      console.log(err.name)
      process.exit(1);
    }
  
    let groupsMetadata = new snykGroupsMetadata(snykKeys);
    await groupsMetadata.init();
  
    debug(`groupsMetadata: ${groupsMetadata}`);
  
    let pendingInvites: PendingInvite[] = await inputUtils.readFileToJson(
      PENDING_INVITES_FILE,
    );
    debug(`pendingInvites: ${pendingInvites}`);
  
    
    // foreach unique group+org get the memberships
    //let uniqueOrgs = await inputUtils.getUniqueOrgs(sourceMemberships);
    //let uniqueGroups = await inputUtils.getUniqueGroups(sourceMemberships);
  
    console.log(`Pending invites found: ${pendingInvites.length}`);
  
    // process each unique group sequentially
    for (const g of sourceGroups) {
      console.log('processing sourceGroup: ' + g.groupName)
      let groupStatus: string[] = await groupsMetadata.getGroupStatusByName(
        g.groupName,
      );
      debug(`groupStatus: ${groupStatus}`);
  
      if (groupStatus[0] == 'enabled') {
        let groupId = await groupsMetadata.getGroupIdByName(g.groupName);
        let groupKey = await groupsMetadata.getGroupKeyByName(g.groupName);
  
        let group = new snykGroup(String(groupId), g.groupName, String(groupKey));
        await group.init();
        debug(`group: ${group}`);
        utils.log(`\nProcessing ${g.groupName} [${groupId}]`);
        //debug(await group.getMembers())
        //remove any 'pending invites' that have since been accepted
        await inputUtils.removeAcceptedPendingInvites(
          groupId,
          await group.getMembers(),
        );
  
        // process any new memberships in the input file
        if (addNewFlag == true) {
          console.log('will add new memberships here')
          //await utils.addNewMemberships(sourceMemberships, group);
        }
      } else {
        utils.log(
          `group ${g.groupName} cannot be processed, skipping: ${groupStatus[1]}`,
        );
        //todo: log to file
      }
    }
    // if flag set, process any memberships that have been
    // removed from the input file for each group within snyk
    if (deleteMissingFlag == true) {
      for (const gmd of await groupsMetadata.getAllGroupsMetadata()) {
        debug(`groupMetadata: ${gmd}`);
        let groupStatus: string[] = await groupsMetadata.getGroupStatusByName(
          gmd.groupName,
        );
        debug(`groupStatus: ${groupStatus}`);
  
        if (groupStatus[0] == 'enabled') {
          utils.log(`\nProcessing stale memberships for ${gmd.groupName}`);
          let group = new snykGroup(gmd.groupId, gmd.groupName, gmd.groupKey);
          await group.init();
          debug(JSON.stringify(await group.getMembers()))
          await utils.removeMembershipsV2(sourceGroups, group);
        } else {
          utils.log(
            `group ${gmd.groupName} cannot be processed, skipping: ${groupStatus[1]}`,
          );
        }
      }
    }
}

async function processMemberships() {
  debug('processing v1 format');
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
}

const run = async () => {
  await inputUtils.initializeDb();
  checkEnvironment();
  //process.exit();

  utils.log(`\nPending invites file: ${PENDING_INVITES_FILE}`);

  if (v2FormatFlag == true) {
    // process with v2 format input file
    processMembershipsV2()
  }
  else {
    // process with v1 original format input file
    processMemberships()
  }
  await inputUtils.backupUserMemberships(snykMembershipFile);
};

run();
