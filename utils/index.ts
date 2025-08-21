import type {
  HttpError,
  HttpResponse,
  Interceptor,
  RequestConfig,
} from "../types";

export class Interceptors<T> {
  private list: (Interceptor<T> | undefined)[] = [];
  use(fn: Interceptor<T>) {
    const id = this.list.push(fn) - 1;
    return id;
  }
  eject(id: number) {
    this.list[id] = undefined;
  }
  async run(v: T) {
    for (const fn of this.list) if (fn) v = await fn(v);
    return v;
  }
}

const isAbs = (u: string) => /^https?:\/\//i.test(u);

export const toHeaders = (h?: HeadersInit) =>
  h instanceof Headers ? h : new Headers(h ?? {});

export const combine = (base: string, rel: string) =>
  isAbs(rel)
    ? rel
    : new URL(rel, base.endsWith("/") ? base : base + "/").toString();

export function makeError<T, D>(
  msg: string,
  cfg: RequestConfig<D>,
  res?: HttpResponse<T, D>,
  status?: number,
): HttpError<T, D> {
  const e = new Error(msg) as HttpError<T, D>;
  e.isAxiosError = true;
  e.response = res;
  e.config = cfg;
  e.status = status;
  e.toJSON = () => ({ message: msg, status, url: cfg.url });
  return e;
}
