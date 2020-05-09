"use strict";

const path = require("path");
const {from} = require("webpack-config-builder");
const pathBuild = path.resolve(__dirname, "build");

module.exports = [
    from("./src/index.ts")
        .withCss()
        .withReact()
        .withLibraryExports("extension", "umd2")
        .to("electron-renderer", pathBuild, "index.js"),
];