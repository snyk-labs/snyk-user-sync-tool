import { requestsManager } from 'snyk-request-manager';
import * as debugLib from 'debug';
import * as fs from 'fs';
import * as path from 'path';
import { snykGroup } from './snykGroup';
import {
  GroupMember,
  Membership,
  PendingMembership,
  GroupOrg,
} from './types';
import * as inputUtils from './inputUtils';
import * as common from './common';
import * as utils from './utils';
import * as customErrors from './customErrors';
import { umask } from 'process';
const readline = require('readline');

const debug = debugLib('snyk:utils');
const { execSync } = require('child_process');



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
  readline.cursorTo(process.stdout, 0)
  process.stdout.write(`${progress}`);
}
