// to catch base directory variations on both windows and *nix
export const BASE_DIR = __dirname.replace(
  /(\/|\\)(dist$|dist(\/|\\).*|src\/lib$)/,
  '/',
);
//export const DB_DIR = BASE_DIR.concat('db');
export const DB_DIR = 'db';
//export const PREV_DIR = BASE_DIR.concat('prev/');
export const PREV_DIR = 'prev/';
export const LOG_DIR = 'log/';
export const PENDING_INVITES_FILE = DB_DIR.concat('/pending_invites.json');
export const VALID_ROLES_FILE = BASE_DIR.concat('conf/roles.json');
export const LOG_LIMIT = 25;
export var DRY_RUN_FLAG: boolean = false;
export var ADD_NEW_FLAG: boolean = false;
export var INVITE_TO_ALL_ORGS_FLAG: boolean = false;
export var DELETE_MISSING_FLAG: boolean = false;
export var API_KEYS: string;
export var MEMBERSHIP_FILE: string;
export var API_BASE_URI: string;
export var AUTO_PROVISION_FLAG: boolean = false;


export function setEnvironment(
  dryRunFlag: boolean,
  addNewFlag: boolean,
  inviteToAllOrgsFlag: boolean,
  deleteMissingFlag: boolean,
  apiKeys: string,
  membershipFile: string,
  apiBaseUri: string,
  autoProvisionFlag: boolean
) {
  DRY_RUN_FLAG = dryRunFlag;
  ADD_NEW_FLAG = addNewFlag;
  INVITE_TO_ALL_ORGS_FLAG = inviteToAllOrgsFlag;
  DELETE_MISSING_FLAG = deleteMissingFlag;
  API_KEYS = apiKeys;
  MEMBERSHIP_FILE = membershipFile;
  API_BASE_URI = apiBaseUri;
  AUTO_PROVISION_FLAG = autoProvisionFlag;
}

var m = new Date();
export var LOG_ID =
  m.getUTCFullYear() +
  '_' +
  ('0' + (m.getUTCMonth() + 1)).slice(-2) +
  '_' +
  ('0' + m.getUTCDate()).slice(-2) +
  '_' +
  ('0' + m.getUTCHours()).slice(-2) +
  '_' +
  ('0' + m.getUTCMinutes()).slice(-2) +
  '_' +
  ('0' + m.getUTCSeconds()).slice(-2);

export const LOG_FILE = LOG_DIR.concat(`user-sync-run-${LOG_ID}.log`);
