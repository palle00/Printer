import type {
  DesktopApi,
} from "./desktop";

export {};

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}