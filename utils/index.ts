import type {
  HttpError,
  HttpResponse,
  RequestConfig,
} from "../types";



export type OnFulfilled<T> = (value: T) => T | Promise<T>;
export type OnRejected = (error: any) => any | Promise<any>;

type Handler<T> = { onFulfilled?: OnFulfilled<T>; onRejected?: OnRejected; };

export class Interceptors<T> {
  private handlers: (Handler<T> | null)[] = [];

 
  use(onFulfilled?: OnFulfilled<T>, onRejected?: OnRejected): number {
    this.handlers.push({ onFulfilled, onRejected });
    return this.handlers.length - 1;
  }

  eject(id: number) {
    if (this.handlers[id]) this.handlers[id] = null;
  }


  async runFulfilled(input: T): Promise<T> {
    let out: any = input;
    for (const h of this.handlers) {
      if (!h?.onFulfilled) continue;
      out = await h.onFulfilled(out);
    }
    return out as T;
  }


  async runRejected(error: any): Promise<any> {
    let err = error;
    for (const h of this.handlers) {
      if (!h?.onRejected) continue;
      try {
     
        return await h.onRejected(err);
      } catch (next) {
        err = next;
      }
    }
    throw err;
  }
}

const isAbs = (u: string) => /^https?:\/\//i.test(u);

export const toHeaders = (h?: HeadersInit) =>
  h instanceof Headers ? h : new Headers(h ?? {});

export const combine = (base: string, rel: string) => {
  if (!rel) return base;
  if (isAbs(rel)) return rel;


  const cleanBase = base.endsWith("/") ? base : base + "/";
  const cleanRel  = rel.replace(/^\/+/, ""); 
  return new URL(cleanRel, cleanBase).toString();
};

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
