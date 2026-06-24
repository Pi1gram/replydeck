import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findOrThrow(id: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  /**
   * Resolve a user by email, creating one if it doesn't exist. Backs the
   * mobile email-login flow so a single app build can serve many users
   * (each enters their email; the returned id becomes their x-user-id).
   *
   * NOTE: open signup — fine for the current friends-and-family testing
   * stage. Gate with an invite/allow-list before any public launch.
   */
  async loginOrCreate(email: string, name?: string) {
    const normalized = email.trim().toLowerCase();
    return this.prisma.user.upsert({
      where: { email: normalized },
      update: name ? { name } : {},
      create: { email: normalized, name: name ?? null }
    });
  }
}
