// to catch base directory variations on both windows and *nix
export const BASE_DIR = __dirname.replace(
  /(\/|\\)(dist$|dist(\/|\\).*|src\/lib$)/,
  '/',
);
export const DB_DIR = BASE_DIR.concat('db');
export const PREV_DIR = BASE_DIR.concat('prev/');
export const LOG_DIR = BASE_DIR.concat('log/');
export const PENDING_INVITES_FILE = DB_DIR.concat('/pending_invites.json');
export const LOG_LIMIT = 25;
export var DRY_RUN_FLAG: boolean = false;
export var ADD_NEW_FLAG: boolean = false;
export var DELETE_MISSING_FLAG: boolean = false;
export var V2_FORMAT_FLAG: boolean;
export var API_KEYS: string;
export var MEMBERSHIP_FILE: string;
export var API_BASE_URI: string;

export function setEnvironment(
  dryRunFlag: boolean,
  addNewFlag: boolean,
  deleteMissingFlag: boolean,
  v2FormatFlag: boolean,
  apiKeys: string,
  membershipFile: string,
  apiBaseUri: string,
) {
  DRY_RUN_FLAG = dryRunFlag;
  ADD_NEW_FLAG = addNewFlag;
  DELETE_MISSING_FLAG = deleteMissingFlag;
  V2_FORMAT_FLAG = v2FormatFlag;
  API_KEYS = apiKeys;
  MEMBERSHIP_FILE = membershipFile;
  API_BASE_URI = apiBaseUri;
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
