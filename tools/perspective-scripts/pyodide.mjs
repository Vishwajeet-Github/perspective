// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

// Pyodide information:
// - Pyodide version we build against
// - Pyodide dist directory

import path from "node:path";
import url from "node:url";
import fs from "node:fs";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);
const workspaceRoot = path.join(__dirname, "..", "..");

const memoize = (f) => {
    let val = undefined;
    return () => {
        if (typeof val !== "undefined") return val;
        val = f();
        return val;
    };
};

export const getPyodideVersion = memoize(() => {
    const workspacePackageJson = path.join(workspaceRoot, "package.json");
    const pyodideVersion = JSON.parse(
        fs.readFileSync(workspacePackageJson)
    ).pyodide;
    if (!pyodideVersion) {
        throw new Error(`"pyodide" not set in package.json`);
    }
    return pyodideVersion;
});

export function getPyodideDownloadDir() {
    return path.join(
        workspaceRoot,
        "rust",
        "target",
        "pyodide",
        getPyodideVersion()
    );
}

export function getPyodideDistDir() {
    return path.join(getPyodideDownloadDir(), "pyodide");
}
