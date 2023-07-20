import * as fs from 'fs';
import * as debugLib from 'debug';
import * as path from 'path';
import { snykGroup } from './snykGroup';
import * as common from './common';
import * as utils from './utils';
import { GroupMember, Membership, v1Group, v2Group, v2Org, v2User } from './types';
import * as customErrors from './customErrors';
import { group } from 'console';

const debug = debugLib('snyk:inputUtils');

/*export async function sortUserMemberships(userMemberships: Membership[]) {
  userMemberships.sort((a: any, b: any) =>
    a.group > b.group ? 1 : a.group === b.group ? (a.org > b.org ? 1 : -1) : -1,
  );
  return userMemberships;
}*/

export async function backupUserMemberships() {
  //store existing input file in prev directory
  let filename: string = path.basename(common.MEMBERSHIP_FILE);
  let destination: string = common.PREV_DIR.concat(
    `${filename}-${common.LOG_ID}`,
  );
  fs.copyFile(common.MEMBERSHIP_FILE, destination, (err) => {
    if (err) throw err;
    debug(`membership file backed up to ${destination}`);
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
  debug('Unique Group-Orgs in input file');
  debug(result);
  return result;
}



export async function getUniqueGroups(userMemberships: Membership[]) {
  const result = [];
  const map = new Map();
  for (const um of userMemberships) {
    let group = um.group;
    if (!map.has(group)) {
      map.set(group, true); // set any value to Map
      result.push({
        name: um.group,
      });
    }
  }
  debug(`unique groups found: ${JSON.stringify(result, null, 2)}`);
  return result;
}

export function printKeys(snykKeys: string) {
  for (const snykKey of snykKeys.split(',')) {
    utils.log(snykKey);
  }
}

export async function initializeDb() {
  debug(`BASE_DIR: ${common.BASE_DIR}`);
  debug('Checking for local files...');
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
export function convertV2intoV1(input:any): Membership[] {
  var convertedMemberships:Membership[] = []

  for(let currGroup of input as any){
    for (var currOrg of currGroup.orgs as any){
      for (var [role , members]of Object.entries(currOrg)){
        if(role !== "orgName"){
          for (var currMember of members as any){
            convertedMemberships.push({
              userEmail: currMember.email,
              role: role,
              org: currOrg.orgName,
              group: currGroup.groupName
            })
          }
        }
      }
    }
  }
  return convertedMemberships
}
export function getGroupAdminsFromV2(input:any): any[]{
  let adminList = []
  for(let currGroup of input as any){
    if("admins" in currGroup){
      for (let admin of currGroup.admins as any){
        adminList.push({
          "email" : admin["email"],
          "groupName" : currGroup.groupName
        })
      }
    }
  }

  return adminList
}
export async function readFileToJson(filePath: string) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    if (data.length > 0) {
      try {
        return JSON.parse(data);
      } catch (err: any) {
        utils.log(`Error parsing file ${filePath}`);
        utils.log(`  - ${err.message}`);
        throw err;
      }
    } else return [];
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      utils.log(`file ${filePath} not found, exiting...`);
      process.exit(1);
    } else {
      throw err;
    }
  }
}

/*export async function validateUserMembership(snykMembership: {
  userEmail: string;
  role: string;
  org: string;
}) {
  var reEmail: RegExp = /\S+@\S+\.\S+/;
  if (reEmail.test(snykMembership.userEmail) == false) {
    //console.log('email regex = false')
    throw new customErrors.InvalidEmail(
      'Invalid email address format. Please verify',
    );
  }
  return true;
}*/
