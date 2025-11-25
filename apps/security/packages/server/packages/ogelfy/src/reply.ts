export interface CookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'strict' | 'lax' | 'none';
  secure?: boolean;
}

export class Reply {
  private _statusCode: number = 200;
  private _headers: Map<string, string> = new Map();

  code(statusCode: number): this {
    this._statusCode = statusCode;
    return this;
  }

  status(statusCode: number): this {
    return this.code(statusCode);
  }

  header(key: string, value: string): this {
    this._headers.set(key.toLowerCase(), value);
    return this;
  }

  headers(headers: Record<string, string>): this {
    for (const [key, value] of Object.entries(headers)) {
      this.header(key, value);
    }
    return this;
  }

  type(contentType: string): this {
    return this.header('content-type', contentType);
  }

  redirect(url: string): Response;
  redirect(statusCode: number, url: string): Response;
  redirect(statusCodeOrUrl: number | string, url?: string): Response {
    const status = typeof statusCodeOrUrl === 'number' ? statusCodeOrUrl : 302;
    const location = typeof statusCodeOrUrl === 'string' ? statusCodeOrUrl : url!;

    return new Response(null, {
      status,
      headers: { location }
    });
  }

  setCookie(name: string, value: string, options?: CookieOptions): this {
    const cookie = this.serializeCookie(name, value, options);

    // Handle multiple cookies
    const existing = this._headers.get('set-cookie');
    if (existing) {
      this._headers.set('set-cookie', `${existing}, ${cookie}`);
    } else {
      this._headers.set('set-cookie', cookie);
    }

    return this;
  }

  clearCookie(name: string, options?: CookieOptions): this {
    return this.setCookie(name, '', { ...options, maxAge: 0 });
  }

  send(payload: any): Response {
    const headers = new Headers();
    for (const [key, value] of this._headers) {
      headers.set(key, value);
    }

    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);

    return new Response(body, {
      status: this._statusCode,
      headers
    });
  }

  private serializeCookie(name: string, value: string, options?: CookieOptions): string {
    let cookie = `${name}=${encodeURIComponent(value)}`;

    if (options?.domain) cookie += `; Domain=${options.domain}`;
    if (options?.expires) cookie += `; Expires=${options.expires.toUTCString()}`;
    if (options?.httpOnly) cookie += `; HttpOnly`;
    if (options?.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
    if (options?.path) cookie += `; Path=${options.path}`;
    if (options?.sameSite) cookie += `; SameSite=${options.sameSite}`;
    if (options?.secure) cookie += `; Secure`;

    return cookie;
  }
}
