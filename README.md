![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)

***
[![CircleCI](https://circleci.com/gh/snyk-tech-services/snyk-user-sync-tool.svg?style=svg&circle-token=bfb34e49aa301cfa4ef4272541360a475ff95ad4)](https://circleci.com/gh/snyk-tech-services/snyk-user-sync-tool)
[![Known Vulnerabilities](https://snyk.io/test/github/snyk-tech-services/snyk-user-sync-tool/badge.svg?targetFile=package.json)](https://snyk.io/test/github/snyk-tech-services/snyk-user-sync-tool?targetFile=package.json)

## snyk-user-sync-tool
sync user org memberships from an external source into (your on-premise instance) of Snyk
- add/update users to orgs (when using `--add-new` flag
- remove users from orgs (when using `--delete-missing` flag)

```
Use the `--dry-run` option to check the execution plan before making any changes to Snyk
```

This tool is designed to be flexible to to use for:
1. _adding user memberships_ - using the `--add-new` flag, add user memberships to Snyk if they are found in the source file but not in Snyk
2. _removing stale user memberships_ - using the `--delete-missing` flag, remove user memberships from Snyk if they are not found in the source file but are in Snyk
3. _true bi-directional sync_ - using both `--add-new` and `--delete-missing`, sync the user memberships in both directions

### Known Limitations
* if users are completely new to the system, they will be sent an invitation to their first org.  after accepting, they will be made members of any other orgs as necessary on a subsequent run.  
* group-level memberships are not currently supported, such as group admin.  If a group admin is found in snyk, but not in the source file, it will be flagged for review but no action will be taken.

### Usage
```
Usage: index.js [OPTIONS]
                If no arguments are specified, values will be picked up from
                environment variables.

                If pointing to a self-hosted or on-premise instance of Snyk,
                SNYK_API is required to be set in your environment,
                e.g. SNYK_API=https://my.snyk.domain/api. If omitted, then Snyk
                SaaS is used.

Options:
  --version          Show version number                               [boolean]
  --add-new          add memberships if they are found in the
                     membership-file and are not in Snyk
  --delete-missing   delete memberships from Snyk if they are found
                     to be missing from the membership-file (use with caution)
  --v2               use v2 file format
  --membership-file  path to membership file
                     if not specified, taken from SNYK_IAM_MEMBERSHIP_FILE
  --api-keys         list of api keys per group
                     if not specified, taken from SNYK_IAM_API_KEYS
  --dry-run          print/log the execution plan without making any updates to
                     Snyk
  --debug            enable debug mode                                 [boolean]
  --help             Show help                                         [boolean]
```
Example:
```
snyk-user-sync-tool --v2 --dry-run --membership-file=snyk-memberships-v2.json --add-new --delete-missing
```
run with debugging enabled: `DEBUG=* snyk-user-sync-tool`

If initial job run, `db`, `prev`, and `log` directories will be created


### Setup Environment
*nix
```
export SNYK_IAM_MEMBERSHIP_FILE=<absolute path to user membership json file>
export SNYK_IAM_API_KEYS='<group name>':<group key>,'<group name>':<group key>
```

if running self-hosted/on-premise Snyk, set the SNYK_API endpoint
```
export SNYK_API=https://<instance host or ip>/api
```

windows
```
set SNYK_IAM_MEMBERSHIP_FILE=<absolute path to user membership json file>
set SNYK_IAM_API_KEYS='<group name>':<group key>,'<group name>':<group key>
```

if running self-hosted/on-premise Snyk, set the SNYK_API endpoint
```
set SNYK_API=https://<instance host or ip>/api
```

- SNYK_IAM_API_KEYS -> you must use single quotes around group name
    - this tool will only sync users for groups which have a key defined here
- SNYK_IAM_MEMBERSHIP_FILE -> typically in source_data dir, but can be anywhere
    - make sure to specify the full path including the filename, for example.: `c:\snyk\snyk_users.json` or `/opt/snyk/snyk_users.json`

if connecting to a Snyk instance using a self-signed certificate, set environment variable `NODE_TLS_REJECT_UNAUTHORIZED=0`

### Membership File format

There are two file formats supported:
#### 1. User-based
   flat representation, each record represents a user membership consisting of their userEmail, role, org, and group. 

```
[
    {
            "userEmail": "user1@email.com",
  	    "role": "collaborator",
  	    "org": "Org Name 1-1",
  	    "group": "Group Name 1"
    },
    {
  	    "userEmail": "user2@email.com",
  	    "role": "admin",
  	    "org": "Org Name 1-1",
  	    "group": "Group Name 1"
    },
    {
  	    "userEmail": "user1@email.com",
  	    "role": "collaborator",
  	    "org": "Org Name 2-1",
  	    "group": "Group Name 2"
    },
    {
  	    "userEmail": "user2@email.com",
  	    "role": "admin",
  	    "org": "Org Name 2-2",
  	    "group": "Group Name 2"
   }
]
```
#### 2. Group-based
   nested representation, comprising a set of groups each containing the group name, the set of orgs, and the set of both admins and collaborators within those orgs.  

This looks like: 

```
{ 
    "groups": [
        {
            "groupName": "Some Group",
            "admins": [],
            "orgs": [
                {
                    "orgName": "Some Org",
                    "collaborators": [
                        {
                            "email": "user@email.address"
                        },
                        {
                            "email": "user2@email.address"
                        }
                    ]
                },
                {
                    "orgName": "Some Other Org",
                    "collaborators": [
                        {
                            "email": "user3@email.address"
                        },
                        {
                            "email": "user4@email.address"
                        }
                    ]
                }
            ]
        },
        {
            "groupName": "Some Other Group",
            "admins": [
                {
                    "email": "user3@email.address"
                },
                {
                    "email": "user4@email.address"
                }
            ],
            "orgs": [
                {
                    "orgName": "Yet Another Org",
                    "collaborators": [
                        {
                            "email": "user6@email.address"
                        },
                        {
                            "email": "user7@email.address"
                        }
                    ]
                }
            ]
        }
    ]
}
```

- Ensure that the org name and group match exactly including the case
- Possible values for role are *collaborator* and *admin*
- Previous job run input is saved in `prev/` directory
- Group Names should be unique and Org Names should be unique within a Group

### Pending invites
- If a user-org membership is being added, and the user is not part of any Snyk org in the group, the an invitation must be sent to first bring the user into the system.
    - After a user accepts the invitation to the first org, from there additional org memberships are handled programmatically.  
    - This means that if adding a user to snyk for the first time, to more than one org, then the first job run will invite them to the first org, and the next job run will add them to the remaining orgs.
- After initial job run, pending invites are tracked locally in `db/pending_invites.json`
    - If this file is lost, it will be recreated.  Used to reduce calls to Snyk if invites are already known to be pending
` Note: If invitations need to be re-sent, you must delete the invitation from Snyk and then delete db/pending_invites.json.  `

### Service Account setup
- In order to populate the group names and keys, you will have to manually create the Groups and a service account in each group.
    - `Note that the name you give the service account is what will appear in the invitation email`
    - `Use the same name across each group being managed by this tool for consistency, for example 'Snyk-User-Sync'`

### Error handling
gracefully skip certain issues and continue processing
* Group memberships are skipped when the API Key for the group is invalid. This event is
also logged.
* Group memberships are skipped when the group name is not found in the
SNYK_IAM_API_KEYS list. This event is also logged.
* Individual memberships are skipped when the role is not a valid option (admin,
collaborator), or if the userEmail field is not a properly formatted email address. This
event is also logged.
* Stale membership removal is skipped for groups when the API Key is invalid. This event
is also logged.

### Logging
Each job run has a log user-sync-run-<mm_dd_yy_mm_ss>.log located in the `logs/` directory local to where the application is installed.

### Contributing
See guidelines [here](.github/CONTRIBUTING.md)
