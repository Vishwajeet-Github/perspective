/******************************************************************************
 *
 * Copyright (c) 2017, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */

var path = require("path");

var loaderUtils = require("loader-utils");
var validateOptions = require("@webpack-contrib/schema-utils");
var fs = require("fs");

var schema = {
    type: "object",
    properties: {
        name: {
            type: "string"
        },
        context: {
            type: "string"
        },
        regExp: {
            type: "string"
        }
    },
    additionalProperties: true
};

exports.default = function loader() {};

exports.pitch = function pitch(request) {
    var options = loaderUtils.getOptions(this) || {};
    validateOptions({ name: "Cross Origin File Loader", schema, target: options });

    var context = options.context || this.rootContext || (this.options && this.options.context);
    var content = fs.readFileSync(request.replace("es/js", "build").replace("wasm.js", "wasm"));
    var url = loaderUtils.interpolateName(this, options.name, {
        context,
        content,
        regExp: options.regExp
    });

    var outputPath = url;
    var publicPath = `__webpack_public_path__ + ${JSON.stringify(outputPath)}`;
    this.emitFile(outputPath, content);

    const utils_path = JSON.stringify(`!!${path.join(__dirname, "utils.js")}`);
    return `
    var utils = require(${utils_path});
    module.exports = (utils.path + ${publicPath});    
    `;
};

exports.raw = true;
