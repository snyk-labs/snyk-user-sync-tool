import { validateUserMembership } from '../src/lib/inputUtils'
import { GroupMember, Membership, PendingInvite } from '../src/lib/types'
import * as customErrors from '../src/lib/customErrors'

const membershipWithInvalidRole: Membership = {
    "userEmail": "scott.esbrandt@snyk.io",
    "role": "administrator",
    "org": "Starfighter Corps Gold Squadron",
    "group": "Rebel Alliance"
  }
const membershipWithInvalidEmail: Membership = {
    "userEmail": "scott.esbrandt@snyk",
    "role": "admin",
    "org": "Starfighter Corps Gold Squadron",
    "group": "Rebel Alliance"
  }

  describe('input validation', () => {
    it('catch invalid role in membership file', async () => {
      await expect(validateUserMembership(membershipWithInvalidRole)).rejects.toThrow(customErrors.InvalidRole)
    })
    it('catch invalid email address in membership file', async () => {
        await expect(validateUserMembership(membershipWithInvalidEmail)).rejects.toThrow(customErrors.InvalidEmail)
      })
  })