export class InvalidRole extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRole';
  }
}

export class InvalidEmail extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEmailAddress';
  }
}

export class OrgIdNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrgIdNotFound';
  }
}
