const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .onnx model files as binary assets
config.resolver.assetExts.push('onnx');

module.exports = config;
