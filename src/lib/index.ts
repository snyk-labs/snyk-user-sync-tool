#!/usr/bin/env node
import * as yargs from 'yargs';
import * as debugLib from 'debug';
import { processMemberships } from './app';
import * as utils from './utils';
import { printKeys, initializeDb, backupUserMemberships } from './inputUtils';
import {
  PREV_DIR,
  PENDING_INVITES_FILE,
  DRY_RUN_FLAG,
  INVITE_TO_ALL_ORGS_FLAG,
  setEnvironment,
  ADD_NEW_FLAG,
  DELETE_MISSING_FLAG,
  AUTO_PROVISION_FLAG,
} from './common';
import { exit } from 'process';

const debug = debugLib('snyk:index');

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
    'dry-run': {
      describe: `print/log the execution plan without making any updates to Snyk`,
      demandOption: false,
    },
    'invite-to-all-orgs': {
      describe: `send new users an invite to every org, rather than only the first`,
      demandOption: false,
    },
    'auto-provison': {
      describe: `Automatically provision users that are new to the group to their respective orgs. 
      This requires that your snyk token is from a non-service account that is signed in through SSO`,
      demandOption: false,
    },
    debug: {
      describe: `enable debug mode`,
      demandOption: false,
      type: 'boolean',
    },
  })
  .help().argv;

function checkEnvironment() {
  //console.log(`DEBUG mode is ${debug}`)
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
  const autoProvisionFlag: boolean = Boolean(
    argv['auto-provision'] ? argv['auto-provision'] : false,
  );
  const dryRunFlag = Boolean(argv['dry-run'] ? argv['dry-run'] : false);
  const inviteToAllOrgsFlag: boolean = Boolean(
    argv['invite-to-all-orgs'] ? argv['invite-to-all-orgs'] : false,
  );

  utils.log(`dry run: ${dryRunFlag}`);
  if (snykApiBaseUri == 'undefined') {
    utils.log('snykApiBaseUri: not specified, default to SaaS');
  } else {
    utils.log(`snykApiBaseUri: ${snykApiBaseUri}`);
  }
  utils.log(`Delete Missing enabled?: ${deleteMissingFlag}`);
  utils.log(`Invite to all orgs enabled?: ${inviteToAllOrgsFlag}`);
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
    printKeys(snykKeys);
    utils.log(`snykMembershipFile: ${snykMembershipFile}`);
    utils.log(`addNewFlag: ${addNewFlag}`);
    utils.log(`deleteMissingFlag: ${deleteMissingFlag}`);
    utils.log(`autoProvision: ${autoProvisionFlag}`);
    yargs.showHelp();
    process.exit(1);
  }

  setEnvironment(
    dryRunFlag,
    addNewFlag,
    inviteToAllOrgsFlag,
    deleteMissingFlag,
    snykKeys,
    snykMembershipFile,
    snykApiBaseUri,
    autoProvisionFlag
  );
}

async function main() {
  await initializeDb();
  checkEnvironment();
  await processMemberships();
  await backupUserMemberships();
}

main();
