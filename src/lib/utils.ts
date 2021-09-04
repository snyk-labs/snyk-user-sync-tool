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
  GroupOrg,
  v2Group,
} from './types';
import * as inputUtils from './inputUtils';
import * as common from './common';
import * as utils from './utils';
import * as customErrors from './customErrors';
import { umask } from 'process';
const readline = require('readline');

const debug = debugLib('snyk:utils');
const { execSync } = require('child_process');

export async function recordPendingInvite(
  groupName: string,
  groupId: string,
  orgName: string,
  org: string,
  email: string,
) {
  let result = [];
  //const pendingInvitesFile: string = 'db/pending_invites.json';
  const pendingInvitesFile: string = common.PENDING_INVITES_FILE;
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

export async function isPendingInvite(userEmail: string, groupId: string) {
  let pendingInvites: PendingInvite[] = await inputUtils.readFileToJson(
    common.PENDING_INVITES_FILE,
  );
  debug(pendingInvites);
  debug(
    `checking if pending invitation exists for ${userEmail} in group ${groupId}`,
  );
  for (const pi of pendingInvites) {
    if (pi.userEmail == userEmail && pi.groupId == groupId) {
      debug(`Invite is pending for ${userEmail} in group ${groupId}`);
      return true;
    }
  }
  debug(`NO invite is pending for ${userEmail} in group ${groupId}`);
  return false;
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

export function printProgress(progress: string) {
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`${progress}`);
}
