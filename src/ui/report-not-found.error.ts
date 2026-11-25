/** A requested report does not exist or its name is not valid (HTTP 404). */
export class ReportNotFoundError extends Error {
  constructor() {
    super('Report not found');
    this.name = 'ReportNotFoundError';
  }
}
