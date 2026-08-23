/**
 * The bridge between the renderer and the main process.
 *
 * One function for everything the app can do: `invoke` goes through the same
 * whitelist in main, which goes through the same service layer an agent uses.
 *
 * The window buttons are the exception, and deliberately so. They are not
 * operations on Tend's data - they are chrome, they answer the same three
 * messages in every app in the suite, and they come from keel so that all of
 * them answer them the same way. Routing them through `invoke` would have made
 * "minimize the window" look like a peer of "log a promise".
 */

import { contextBridge, ipcRenderer } from "electron";
import { windowControlsBridge } from "keel/window";

contextBridge.exposeInMainWorld("tend", {
  /**
   * @param {string} name Operation name.
   * @param {Record<string, any>} [args]
   * @returns {Promise<any>}
   */
  invoke: (name, args) => ipcRenderer.invoke("tend:invoke", name, args ?? {}),

  ...windowControlsBridge(ipcRenderer)
});
