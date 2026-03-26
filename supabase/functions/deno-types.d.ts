declare const Deno: {
  env: {
      get(key: string): string | undefined;
    };
    serve(fn: (req: Request) => Promise<Response>): void;
  };
