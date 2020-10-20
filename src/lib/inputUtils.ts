import * as fs from 'fs';
import * as debugLib from 'debug';
import * as path from 'path';
import { snykGroup } from './snykGroup';
import * as common from './common';
import * as utils from './utils';
import { GroupMember, Membership, PendingInvite } from './types';
import * as customErrors from './customErrors';

const debug = debugLib('snyk:inputUtils');

export async function sortUserMemberships(userMemberships: Membership[]) {
  userMemberships.sort((a: any, b: any) =>
    a.group > b.group ? 1 : a.group === b.group ? (a.org > b.org ? 1 : -1) : -1,
  );
  return userMemberships;
}

export async function backupUserMemberships(membershipFile: string) {
  //store existing input file in prev directory
  let filename: string = path.basename(membershipFile);
  let destination: string = common.PREV_DIR.concat(
    `${filename}-${common.LOG_ID}`,
  );
  fs.copyFile(membershipFile, destination, (err) => {
    if (err) throw err;
    utils.log(`\nmembership file backed up to ${destination}`);
    return true;
  });
}

export async function getUniqueOrgs(userMemberships: Membership[]) {
  const result = [];
  const map = new Map();
  for (const um of userMemberships) {
    //console.log(item.Group)
    let groupOrg = um.group + '-' + um.org;
    if (!map.has(groupOrg)) {
      map.set(groupOrg, true); // set any value to Map
      result.push({
        groupOrg: groupOrg,
        group: um.group,
        org: um.org,
      });
    }
  }
  debug('\nUnique Group-Orgs in input file');
  debug(result);
  debug('\n');
  return result;
}

async function getPendingInvites(): Promise<PendingInvite[]> {
  let pendingInvites: PendingInvite[] = [];
  utils.log(` - Checking status of pending invites... `);
  if (fs.statSync(common.PENDING_INVITES_FILE)['size'] == 0) {
    debug(' - None Found (0 byte file)');
    return [];
  }
  try {
    pendingInvites = await readFileToJson(common.PENDING_INVITES_FILE);
    debug(pendingInvites);
  } catch (err) {
    if (err instanceof SyntaxError) {
      utils.log(' - Invalid JSON, skipping...');
    } else {
      utils.log(err.name);
    }
  }
  return pendingInvites;
}

export async function removeAcceptedPendingInvites(
  groupId: string,
  groupMembers: GroupMember[],
) {
  debug(groupMembers);
  let result: PendingInvite[] = [];

  // get pendingInvites for this group
  let pendingInvites: PendingInvite[] = await getPendingInvites();

  debug(pendingInvites);

  if (pendingInvites.length > 0) {
    for (const pi of pendingInvites) {
      let found: boolean = false;
      for (const gm of groupMembers) {
        if (gm.groupRole != 'admin' && gm.groupRole != 'viewer') {
          if (
            groupId == pi.groupId &&
            gm.email.toUpperCase() == pi.userEmail.toUpperCase()
          ) {
            found = true;
            utils.log(
              `found accepted invite for ${pi.userEmail} in ${pi.groupName}`,
            );
            break;
          }
        }
      }
      if (found == false) {
        debug('pushing invite to result:');
        debug(pi);
        result.push(pi);
      }
    }
    debug('writing to invite file: ');
    debug(result);

    if (!common.DRY_RUN) {
      fs.writeFileSync(
        common.PENDING_INVITES_FILE,
        JSON.stringify(result, null, 4),
      );
    }
  }
}

export async function getUniqueGroups(userMemberships: Membership[]) {
  const result = [];
  const map = new Map();
  for (const um of userMemberships) {
    debug(um.group);
    let group = um.group;
    if (!map.has(group)) {
      map.set(group, true); // set any value to Map
      result.push({
        name: um.group,
      });
    }
  }
  debug(result);
  return result;
}

export function printKeys(snykKeys: string) {
  for (const snykKey of snykKeys.split(',')) {
    utils.log(snykKey);
  }
}

export async function initializeDb() {
  debug(`\nBASE_DIR: ${common.BASE_DIR}`);
  debug('\nChecking for local DB files...');
  if (!fs.existsSync(common.DB_DIR)) {
    //create DB_DIR
    debug(`db dir does not exist, creating ${common.DB_DIR} ...`);
    fs.mkdirSync(common.DB_DIR);
  } else {
    debug(`db dir (${common.DB_DIR}) already exists`);
  }
  if (!fs.existsSync(common.PENDING_INVITES_FILE)) {
    //create empty PENDING_INVITES_FILE
    debug(
      `pending invites file does not exist, initializing ${common.PENDING_INVITES_FILE} ...`,
    );
    fs.writeFileSync(common.PENDING_INVITES_FILE, '[]');
  } else {
    debug(
      `pending invites file (${common.PENDING_INVITES_FILE}) already exists`,
    );
  }
  if (!fs.existsSync(common.PREV_DIR)) {
    //create PREV_DIR
    debug(`prev dir does not exist, creating ${common.PREV_DIR} ...`);
    fs.mkdirSync(common.PREV_DIR);
  } else {
    debug(`prev dir ${common.PREV_DIR} already exists`);
  }
  if (!fs.existsSync(common.LOG_DIR)) {
    //create PREV_DIR
    debug(`log dir does not exist, creating ${common.LOG_DIR} ...`);
    fs.mkdirSync(common.LOG_DIR);
  } else {
    debug(`log dir ${common.LOG_DIR} already exists`);
  }
  debug('Pruning logs and backup files if needed...');
  pruneDir(common.LOG_DIR);
  pruneDir(common.PREV_DIR);
}

function pruneDir(dir: string) {
  let files = fs.readdirSync(dir);
  let filesSorted = files.sort(function(a, b) {
    return (
      fs.statSync(dir + b).mtime.getTime() -
      fs.statSync(dir + a).mtime.getTime()
    );
  });
  let counter = 0;
  for (const file of filesSorted) {
    //console.log(file)
    if (counter >= common.LOG_LIMIT) {
      fs.unlinkSync(dir.concat('/').concat(file));
      utils.log(`pruning ${file}`);
    }
    counter++;
  }
}

export async function readFileToJson(filePath: string) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    if (data.length > 0) {
      try {
        return JSON.parse(data);
      } catch (err) {
        utils.log(`Error parsing file ${filePath}`);
        utils.log(`  - ${err.message}`);
        throw err;
      }
    } else return [];
  } catch (err) {
    if (err.code === 'ENOENT') {
      utils.log(`file ${filePath} not found, exiting...`);
      process.exit(1);
    } else {
      throw err;
    }
  }
}

export async function validateUserMembership(userMembership: Membership) {
  var reEmail: RegExp = /\S+@\S+\.\S+/;

  if (
    !(
      ['admin'.toUpperCase(), 'collaborator'.toUpperCase()].indexOf(
        userMembership.role.toUpperCase(),
      ) >= 0
    )
  ) {
    throw new customErrors.InvalidRole(
      'Invalid value for role. Acceptable values are one of [admin, collaborator]',
    );
  }
  if (reEmail.test(userMembership.userEmail) == false) {
    //console.log('email regex = false')
    throw new customErrors.InvalidEmail(
      'Invalid email address format. Please verify',
    );
  }
  return true;
}
