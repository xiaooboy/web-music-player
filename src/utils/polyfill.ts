import { apply, isSupported } from "dialog-closedby-polyfill";

if (!isSupported()) {
  apply();
}
