/**
 * The bridge between the renderer and the main process.
 *
 * One function, deliberately. Everything the window can do goes through the
 * same whitelist in main, which goes through the same service layer an agent
 * uses.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("tend", {
  /**
   * @param {string} name Operation name.
   * @param {Record<string, any>} [args]
   * @returns {Promise<any>}
   */
  invoke: (name, args) => ipcRenderer.invoke("tend:invoke", name, args ?? {})
});
