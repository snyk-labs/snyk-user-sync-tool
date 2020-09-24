![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)

***

## snyk-user-sync-tool
sync user org memberships from an external source into (your on-premise instance) of Snyk
- add users to orgs
- update user org roles
- remove users from orgs (only when using `--delete-missing` flag)

### Usage
```
Usage: snyk-user-sync-tool [OPTIONS]
                If no arguments are specified, values will be picked up from
                environment variables

Options:
  --version          Show version number                               [boolean]
  --delete-missing   delete memberships from Snyk if they are found
                     to be missing from the membership-file (use with caution)
  --membership-file  path to membership file
                     if not specified, taken from SNYK_IAM_MEMBERSHIP_FILE
  --api-keys         list of api keys per group
                     if not specified, taken from SNYK_IAM_API_KEYS
  --api-uri          API base URI like https://my.snyk.domain/api
                     if not specified, taken from SNYK_API
  --debug            enable debug mode                                 [boolean]
  --help             Show help                                         [boolean]
```

If initial job run, `db`, `prev`, and `log` directories will be created

run with debugging enabled: `DEBUG=* snyk-user-sync-tool`

### Setup Environment
*nix
```
export SNYK_IAM_MEMBERSHIP_FILE=<absolute path to user membership json file>
export SNYK_API=https://<instance host or ip>/api
export SNYK_IAM_API_KEYS='<group name>':<group key>,'<group name>':<group key>
```

windows
```
set SNYK_IAM_MEMBERSHIP_FILE=<absolute path to user membership json file>
set SNYK_API=https://<instance host or ip>/api
set SNYK_IAM_API_KEYS='<group name>':<group key>,'<group name>':<group key>
```

- SNYK_IAM_API_KEYS -> you must use single quotes around group name
    - this tool will only sync users for groups which have a key defined here
- SNYK_IAM_MEMBERSHIP_FILE -> typically in source_data dir, but can be anywhere
    - make sure to specify the full path including the filename, for example.: `c:\snyk\snyk_users.json` or `/opt/snyk/snyk_users.json`

if connecting to a Snyk instance using a self-signed certificate, set environment variable `NODE_TLS_REJECT_UNAUTHORIZED=0`

### Membership File format
Sample:
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

### Service Account setup
- In order to populate the group names and keys, you will have to manually create the Groups and a service account in each group.
    - `Note that the name you give the service account is what will appear in the invitation email`
    - `Use the same name across each group being managed by this tool for consistency, for example 'Snyk-User-Sync'`
