import { createDirectus, staticToken, rest } from '@directus/sdk';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DirectusService {
  public getClient(port: number, token: string) {
    return createDirectus(`http://localhost:${port}`)
      .with(staticToken(token))
      .with(rest());
  }
}
