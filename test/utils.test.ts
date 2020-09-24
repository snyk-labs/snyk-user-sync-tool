import { getOrgIdFromName } from '../src/lib/utils'
import { GroupMember, Membership, PendingInvite, GroupOrg } from '../src/lib/types'
import * as customErrors from '../src/lib/customErrors'

const groupOrgsNoMatch: GroupOrg[] = [ 
  {
      name: 'name 1',
      id: 'id1',
      slug: 'slug-1',
      url: 'url',
      group: {
          name: 'group name', 
          id: 'group id'
      }
  },
  {
      name: 'name 2',
      id: 'id2',
      slug: 'slug-2',
      url: 'url',
      group: {
        name: 'group name', 
        id: 'group id'
    },
  }
]

  describe('org matching', () => {
    it('catch unmatched org name in input file', async () => {
      await expect(getOrgIdFromName('no match', groupOrgsNoMatch)).rejects.toThrow(customErrors.OrgIdNotFound)
    })
  })