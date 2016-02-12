// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {FileSystem} from "../common/node/fileSystem";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {CommandPaletteHandler} from "./commandPaletteHandler";
import {Node} from "../common/node/node";
import {ReactNativeProjectHelper} from "../common/reactNativeProjectHelper";
import {ReactDirManager} from "./reactDirManager";
import {TsConfigHelper} from "./tsconfigHelper";
import {SettingsHelper} from "./settingsHelper";

export function activate(context: vscode.ExtensionContext): void {
    let reactNativeProjectHelper = new ReactNativeProjectHelper(vscode.workspace.rootPath);
    reactNativeProjectHelper.isReactNativeProject().then(isRNProject => {
        if (isRNProject) {
            setupReactNativeDebugger();
            setupReactNativeIntellisense();
            context.subscriptions.push(new ReactDirManager());
        }
    });

    let commandPaletteHandler = new CommandPaletteHandler(vscode.workspace.rootPath);

    // Register React Native commands
    context.subscriptions.push(vscode.commands.registerCommand("reactNative.runAndroid",
        () => commandPaletteHandler.runAndroid()));
    context.subscriptions.push(vscode.commands.registerCommand("reactNative.runIos",
        () => commandPaletteHandler.runIos()));
    context.subscriptions.push(vscode.commands.registerCommand("reactNative.startPackager",
        () => commandPaletteHandler.startPackager()));
    context.subscriptions.push(vscode.commands.registerCommand("reactNative.stopPackager",
        () => commandPaletteHandler.stopPackager()));
}

/**
 * Sets up the debugger for the React Native project by dropping
 * the debugger stub into the workspace
 */
function setupReactNativeDebugger(): void {
    let launcherPath = require.resolve("../debugger/launcher");
    let pkg = require("../../package.json");
    const extensionVersionNumber = pkg.version;
    const extensionName = pkg.name;

    let debuggerEntryCode =
        `// This file is automatically generated by ${extensionName}@${extensionVersionNumber}
// Please do not modify it manually. All changes will be lost.
try {
    var path = require("path");
    var Launcher = require(${JSON.stringify(launcherPath)}).Launcher;
    new Launcher(path.resolve(__dirname, "..")).launch();
} catch (e) {
    throw new Error("Unable to launch application. Try deleting .vscode/launchReactNative.js and restarting vscode.");
}`;

    let vscodeFolder = path.join(vscode.workspace.rootPath, ".vscode");
    let debugStub = path.join(vscodeFolder, "launchReactNative.js");
    let fsUtil = new FileSystem();

    fsUtil.ensureDirectory(vscodeFolder)
        .then(() => fsUtil.ensureFileWithContents(debugStub, debuggerEntryCode))
        .catch((err: Error) => {
            vscode.window.showErrorMessage(err.message);
        });
}

function setupReactNativeIntellisense(): void {
    if (!process.env.VSCODE_TSJS) {
        vscode.window.showInformationMessage("Turn on Salsa intellisense for VS Code?", "Yes")
            .then(function(result: string) {
                if (result === "Yes") {
                    enableSalsa();
                }
            });
    }

    TsConfigHelper.allowJs(true)
        .then(function() {
            return TsConfigHelper.addExcludePaths(["node_modules"]);
        })
        .done();

    let reactTypingsSource = path.resolve(__dirname, "..", "..", "ReactTypings");
    let reactTypingsDest = path.resolve(vscode.workspace.rootPath, ".vscode", "typings");
    let fileSystem = new FileSystem();

    fileSystem.copyRecursive(reactTypingsSource, reactTypingsDest)
        .then(function() {
            return installTypescriptNext();
        })
        .done();
}

function installTypescriptNext(): Q.Promise<void> {
    let typeScriptNextSource = path.resolve(__dirname, "..", "..", "TypescriptNext");
    let typeScriptNextDest = path.resolve(vscode.workspace.rootPath, ".vscode");
    let typeScriptNextLibPath = path.join(typeScriptNextDest, "typescript", "lib");
    let fileSystem: FileSystem = new FileSystem();

    let p = process.env.HOME || process.env.USERPROFILE;

    return fileSystem.exists(typeScriptNextLibPath)
        .then(function(exists: boolean) {
            if (!exists) {
                return fileSystem.copyRecursive(typeScriptNextSource, typeScriptNextDest);
            }
        })
        .then(function() {
            return SettingsHelper.typescriptTsdk(typeScriptNextLibPath);
        });
}

function enableSalsa(): void {
    if (!process.env.VSCODE_TSJS) {
        let setSalsaEnvVariable: string = "";
        if (os.type() === "Darwin") {
            setSalsaEnvVariable = "launchctl setenv VSCODE_TSJS 1";
        } else if (os.type() === "Windows") {
            setSalsaEnvVariable = "setx VSCODE_TSJS 1";
        }

        let childProcess = new Node.ChildProcess();
        childProcess.exec(setSalsaEnvVariable);

        installTypescriptNext()
            .then(function() {
                vscode.window.showInformationMessage("Salsa intellisense for VS Code was turned on. Restart to enable it.");
            })
            .done();
    }
}
