/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Set by middleware for /admin and /api/admin requests after Access verification. */
    // A top-level `import type` would turn this ambient file into a module, so use an inline import type.
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    admin?: import('./server/auth/access').AdminIdentity;
  }
}
