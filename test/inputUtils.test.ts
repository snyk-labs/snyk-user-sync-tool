import { validateUserMembership } from '../src/lib/inputUtils'
import { Membership } from '../src/lib/types'
import * as customErrors from '../src/lib/customErrors'

const membershipWithInvalidRole: Membership = {
    "userEmail": "scott.esbrandt@snyk.io",
    "role": "administrator",
    "org": "Starfighter Corps Gold Squadron",
    "group": "Rebel Alliance"
  }
  const membershipWithCustomRole: Membership = {
    "userEmail": "scott.esbrandt@snyk.io",
    "role": "restrictedCollaborator",
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
    it('catch invalid email address in membership file', async () => {
      await expect(validateUserMembership(membershipWithInvalidEmail)).rejects.toThrow(customErrors.InvalidEmail)
    })
    it('validate custom role (from conf/roles.json)', async () => {
      expect(await validateUserMembership(membershipWithCustomRole)).resolves
    })
  })