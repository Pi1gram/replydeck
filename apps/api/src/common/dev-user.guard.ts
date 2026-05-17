import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "./prisma.service";
import { PUBLIC_ROUTE_KEY } from "./public.decorator";

@Injectable()
export class DevUserGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const headerValue = req.headers["x-user-id"];
    const headerId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const resolvedId =
      (typeof headerId === "string" && headerId.trim().length > 0
        ? headerId.trim()
        : null) ?? process.env.DEV_USER_ID;

    if (!resolvedId) {
      throw new UnauthorizedException(
        "Missing x-user-id header and no DEV_USER_ID configured"
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: resolvedId }
    });

    if (!user) {
      throw new UnauthorizedException("Unknown dev user");
    }

    req.user = { id: user.id };
    return true;
  }
}
