"use strict";

const path = require("path");
const {from} = require("webpack-config-builder");
const pathBuild = path.resolve(__dirname, "build");

const externals = {
    react: "React",
};

module.exports = [
    from("./src/index.ts")
        .withCss()
        .withReact()
        .withExternals(externals)
        .asLibrary("umd2", "extension")
        .to("web", pathBuild, "index.js"),
];