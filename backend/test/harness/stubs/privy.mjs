export const privyState = { users: {} }
export class PrivyClient {
  async verifyAuthToken(token) { if (!privyState.users[token]) throw new Error('invalid'); return { userId: token } }
  async getUser(id) { return privyState.users[id] }
}
