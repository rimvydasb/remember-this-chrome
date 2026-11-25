/** The item (or the follow-up) was deleted while a pipeline worked on it. */
export class ItemDeletedError extends Error {
  constructor() {
    super('The item was deleted.');
  }
}
