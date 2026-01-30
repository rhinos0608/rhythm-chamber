
interface User {
  name: string;
  age: number;
}

export class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(u => u.age === id);
  }
}

export const userService = new UserService();
