// Explicit IPC allowlist. The renderer NEVER receives ipcRenderer, require,
// or Node APIs — only the `window.hshDesktop` bridge defined in preload.ts,
// which forwards exactly these channels with validated arguments.

export const IPC_CHANNELS = [
  "hsh:get-config",
  "hsh:set-backend-url",
  "hsh:validate-backend",
  "hsh:frontend-ready",
  "hsh:get-versions",
  "hsh:print",
  "hsh:select-files",
  "hsh:open-external",
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];

export function isAllowedChannel(channel: unknown): channel is IpcChannel {
  return typeof channel === "string" && (IPC_CHANNELS as readonly string[]).includes(channel);
}

// Argument validators per channel. Throw on violation; handlers treat any
// throw as a user-safe rejection (message only, no stack to renderer).
export function validateIpcArgs(channel: IpcChannel, args: unknown[]): unknown[] {
  switch (channel) {
    case "hsh:get-config":
    case "hsh:frontend-ready":
    case "hsh:get-versions":
      if (args.length !== 0) throw new Error("This action takes no arguments.");
      return [];
    case "hsh:set-backend-url": {
      if (args.length !== 1 || typeof args[0] !== "string") throw new Error("Server URL must be a string.");
      if (args[0].length > 2048) throw new Error("Server URL is too long.");
      return [args[0]];
    }
    case "hsh:validate-backend": {
      if (args.length > 1) throw new Error("Too many arguments.");
      if (args.length === 1 && typeof args[0] !== "string") throw new Error("Server URL must be a string.");
      return args;
    }
    case "hsh:print": {
      const opts = args.length === 0 ? {} : args[0];
      if (args.length > 1 || typeof opts !== "object" || opts === null || Array.isArray(opts)) {
        throw new Error("Print options must be an object.");
      }
      const o = opts as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      if (o.silent !== undefined) {
        if (typeof o.silent !== "boolean") throw new Error("print.silent must be a boolean.");
        out.silent = o.silent;
      }
      if (o.landscape !== undefined) {
        if (typeof o.landscape !== "boolean") throw new Error("print.landscape must be a boolean.");
        out.landscape = o.landscape;
      }
      for (const k of Object.keys(o)) {
        if (k !== "silent" && k !== "landscape") throw new Error(`Unknown print option: ${k}.`);
      }
      return [out];
    }
    case "hsh:select-files": {
      const opts = args.length === 0 ? {} : args[0];
      if (args.length > 1 || typeof opts !== "object" || opts === null || Array.isArray(opts)) {
        throw new Error("File options must be an object.");
      }
      const o = opts as Record<string, unknown>;
      const out: Record<string, unknown> = { multiple: false };
      if (o.multiple !== undefined) {
        if (typeof o.multiple !== "boolean") throw new Error("multiple must be a boolean.");
        out.multiple = o.multiple;
      }
      if (o.filters !== undefined) {
        if (!Array.isArray(o.filters)) throw new Error("filters must be an array.");
        out.filters = o.filters.slice(0, 8).map((f) => {
          if (typeof f !== "object" || f === null) throw new Error("Invalid file filter.");
          const ff = f as Record<string, unknown>;
          if (typeof ff.name !== "string" || !Array.isArray(ff.extensions)) throw new Error("Invalid file filter.");
          return {
            name: ff.name.slice(0, 64),
            extensions: ff.extensions.filter((e) => typeof e === "string").slice(0, 32).map((e) => String(e).slice(0, 16)),
          };
        });
      }
      for (const k of Object.keys(o)) {
        if (k !== "multiple" && k !== "filters") throw new Error(`Unknown file option: ${k}.`);
      }
      return [out];
    }
    case "hsh:open-external": {
      if (args.length !== 1 || typeof args[0] !== "string") throw new Error("URL must be a string.");
      if (args[0].length > 2048) throw new Error("URL is too long.");
      let parsed: URL;
      try {
        parsed = new URL(args[0]);
      } catch {
        throw new Error("URL is not valid.");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Only http(s) links can be opened.");
      }
      return [parsed.toString()];
    }
    default:
      throw new Error("Unknown channel.");
  }
}

// Renderer → main event names (main → renderer only).
export const IPC_EVENTS = ["hsh:backend-status"] as const;
