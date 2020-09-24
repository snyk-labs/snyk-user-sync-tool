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
